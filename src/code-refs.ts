import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, relative } from 'node:path';
import { walkEntries } from './walk.js';

/** Glob patterns used to exclude directories/files from code-ref scanning.
 *  Shared between rg args and the TS fallback's walkFiles filter. */
const EXCLUDE_DIRS = ['omni.md', '.claude'];
const EXCLUDE_GLOBS = ['*.md'];

/** Walk project files for code-ref scanning. Uses walkEntries for .gitignore
 *  support, then additionally skips .md files, omni.md/, .claude/, and sub-projects. */
export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await walkEntries(dir);

  // Collect directories that contain their own omni.md/ (sub-projects)
  const subProjects = new Set<string>();
  for (const e of entries) {
    const i = e.indexOf('/omni.md/');
    if (i !== -1) subProjects.add(e.slice(0, i + 1));
  }

  return entries
    .filter(
      (e) =>
        !e.endsWith('.md') &&
        !e.startsWith('omni.md/') &&
        !e.startsWith('.claude/') &&
        ![...subProjects].some((prefix) => e.startsWith(prefix)),
    )
    .map((e) => join(dir, e));
}

/** Build a RegExp from a verbose template — whitespace is insignificant. */
function re(flags: string) {
  return (strings: TemplateStringsArray) =>
    new RegExp(strings.raw[0].replace(/\s+/g, ''), flags);
}

// Line comment (// or #), then @omni: marker, then [[target]]
export const OMNI_REF_RE = re('gv')`
  (?: // | # )
  \s* @omni: \s*
  \[\[
    ( [^\]]+ )
  \]\]
`;

export type CodeRef = {
  target: string;
  file: string;
  line: number;
};

export type ScanResult = {
  refs: CodeRef[];
  files: string[];
  usedRg: boolean;
};

/**
 * Run an external command and return stdout, or null if the command is not found
 * or fails.
 */
function tryExec(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 50 * 1024 * 1024 }, (err, out) => {
      if (err) {
        // Exit code 1 with no stderr typically means "no matches" for grep/rg
        const exitCode = (
          err as NodeJS.ErrnoException & { code?: string | number }
        ).code;
        if (exitCode === 'ENOENT') {
          resolve(null); // command not found
          return;
        }
        // rg/grep exit 1 = no matches (not an error)
        if (
          'status' in err &&
          (err as { status?: number }).status === 1 &&
          out === ''
        ) {
          resolve('');
          return;
        }
        resolve(null);
        return;
      }
      resolve(out);
    });
  });
}

/**
 * Detect sub-projects (directories containing their own omni.md/) using
 * rg --files. Finds files inside nested omni.md/ dirs and extracts the parent
 * directory paths. Returns paths relative to projectRoot.
 */
async function findSubProjects(projectRoot: string): Promise<string[]> {
  // List files inside any omni.md/ dir, then extract unique parent paths.
  // The root omni.md/ is excluded by EXCLUDE_DIRS in the caller, so we only
  // need to find nested ones here — search for files under */omni.md/.
  const out = await tryExec(
    'rg',
    ['--files', '--glob', '**/omni.md/**', '.'],
    projectRoot,
  );
  if (!out) return [];

  const subProjects = new Set<string>();
  for (const line of out.split('\n')) {
    if (!line) continue;
    const clean = line.startsWith('./') ? line.slice(2) : line;
    // "tests/cases/foo/omni.md/specs.md" → "tests/cases/foo"
    // Skip root omni.md/ (no parent prefix — starts with "omni.md/")
    const idx = clean.indexOf('/omni.md/');
    if (idx !== -1) subProjects.add(clean.slice(0, idx));
  }
  return [...subProjects];
}

/** Build rg glob exclusion args. */
function rgExcludeArgs(subProjects: string[]): string[] {
  const args: string[] = [];
  for (const dir of EXCLUDE_DIRS) args.push('--glob', `!${dir}/`);
  for (const glob of EXCLUDE_GLOBS) args.push('--glob', `!${glob}`);
  for (const sp of subProjects) args.push('--glob', `!${sp}/`);
  return args;
}

/**
 * Try scanning with ripgrep. Returns parsed refs and scanned file list, or null
 * if rg is not available. rg respects .gitignore by default; we add glob
 * exclusions for omni.md/, .claude/, *.md files, and sub-projects.
 */
async function tryRipgrep(
  projectRoot: string,
): Promise<{ refs: CodeRef[]; files: string[] } | null> {
  // Detect sub-projects first so we can exclude them from all rg calls
  const subProjects = await findSubProjects(projectRoot);
  const excludes = rgExcludeArgs(subProjects);

  // Search for @omni refs
  const searchArgs = [
    '--no-heading',
    '--line-number',
    '--with-filename',
    ...excludes,
    '@omni:.*\\[\\[',
    '.',
  ];
  const out = await tryExec('rg', searchArgs, projectRoot);
  if (out === null) return null;

  const { refs } = parseGrepOutput(out, projectRoot);

  // List all scanned files (for stats) — rg --files is fast
  const filesOut = await tryExec(
    'rg',
    ['--files', ...excludes, '.'],
    projectRoot,
  );
  const files = (filesOut || '')
    .split('\n')
    .filter(Boolean)
    .map((f) => {
      const clean = f.startsWith('./') ? f.slice(2) : f;
      return join(projectRoot, clean);
    });

  return { refs, files };
}

/**
 * Parse rg output lines (file:line:content) into CodeRef entries.
 */
function parseGrepOutput(
  output: string,
  projectRoot: string,
): { refs: CodeRef[] } {
  const refs: CodeRef[] = [];

  if (!output.trim()) return { refs };

  for (const line of output.split('\n')) {
    if (!line) continue;
    // Format: ./path/to/file:linenum:content
    const firstColon = line.indexOf(':');
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(':', firstColon + 1);
    if (secondColon === -1) continue;

    let filePath = line.slice(0, firstColon);
    const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
    const content = line.slice(secondColon + 1);

    if (isNaN(lineNum)) continue;

    // Strip leading ./ from path
    if (filePath.startsWith('./')) filePath = filePath.slice(2);

    // Extract targets using the same regex as the TS fallback
    OMNI_REF_RE.lastIndex = 0;
    let match;
    while ((match = OMNI_REF_RE.exec(content)) !== null) {
      refs.push({ target: match[1], file: filePath, line: lineNum });
    }
  }

  return { refs };
}

/**
 * TypeScript fallback: read every file and scan for @omni refs.
 */
async function scanWithTs(
  files: string[],
  projectRoot: string,
): Promise<CodeRef[]> {
  const refs: CodeRef[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf-8');
    } catch (err) {
      process.stderr.write(
        `Error: failed to read ${file}: ${(err as Error).message}\n`,
      );
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      OMNI_REF_RE.lastIndex = 0;
      while ((match = OMNI_REF_RE.exec(lines[i])) !== null) {
        refs.push({
          target: match[1],
          file: relative(projectRoot, file),
          line: i + 1,
        });
      }
    }
  }

  return refs;
}

/** Check whether ripgrep (`rg`) is available on PATH. */
export async function hasRipgrep(): Promise<boolean> {
  const result = await tryExec('rg', ['--version'], '.');
  return result !== null;
}

export async function scanCodeRefs(projectRoot: string): Promise<ScanResult> {
  // Fast path: use rg for both searching and file listing
  // _OMNI_DISABLE_RG is a test-only escape hatch to force the TS fallback
  if (process.env._OMNI_DISABLE_RG !== '1') {
    const rgResult = await tryRipgrep(projectRoot);
    if (rgResult !== null) {
      return { refs: rgResult.refs, files: rgResult.files, usedRg: true };
    }
  }

  // Fallback: walk files ourselves and scan with TS
  const files = await walkFiles(projectRoot);
  const refs = await scanWithTs(files, projectRoot);
  return { refs, files, usedRg: false };
}
