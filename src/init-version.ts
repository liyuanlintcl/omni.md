import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bump this number whenever `omni init` setup changes in a way that
 * requires users to re-run it (e.g. new hooks, AGENTS.md changes,
 * MCP config changes).
 */
export const INIT_VERSION = 1;

type InitMeta = {
  init_version: number;
  /** SHA-256 hashes of template-generated files, keyed by project-relative path. */
  file_hashes?: Record<string, string>;
};

function cachePath(omniDir: string): string {
  return join(omniDir, '.cache', 'lat_init.json');
}

function readMeta(omniDir: string): InitMeta | null {
  const p = cachePath(omniDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function readInitVersion(omniDir: string): number | null {
  const meta = readMeta(omniDir);
  if (!meta) return null;
  return typeof meta.init_version === 'number' ? meta.init_version : null;
}

export function readFileHash(omniDir: string, relPath: string): string | null {
  const meta = readMeta(omniDir);
  return meta?.file_hashes?.[relPath] ?? null;
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function writeInitMeta(
  omniDir: string,
  fileHashes: Record<string, string>,
): void {
  const cacheDir = join(omniDir, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  // Merge with existing hashes so we don't lose entries from agents
  // that weren't selected this run
  const existing = readMeta(omniDir);
  const mergedHashes = { ...existing?.file_hashes, ...fileHashes };
  const data: InitMeta = {
    init_version: INIT_VERSION,
    file_hashes: mergedHashes,
  };
  writeFileSync(cachePath(omniDir), JSON.stringify(data, null, 2) + '\n');
}
