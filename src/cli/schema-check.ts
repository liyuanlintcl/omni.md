import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CmdContext, CmdResult } from '../context.js';
import {
  validateSchema,
  findSchemas,
  deriveDocPath,
} from '../schema-check/schema-check.js';

export async function schemaCheckCommand(
  ctx: CmdContext,
  schemaRel?: string,
): Promise<CmdResult> {
  const schemaDir = join(ctx.projectRoot, 'omni.schema');
  if (!existsSync(schemaDir)) {
    return { output: 'No omni.schema/ directory found', isError: true };
  }

  if (schemaRel) {
    return runSingle(ctx, schemaDir, schemaRel);
  }
  return runAll(ctx, schemaDir);
}

async function runSingle(
  ctx: CmdContext,
  schemaDir: string,
  schemaRel: string,
): Promise<CmdResult> {
  const schemaPath = join(schemaDir, schemaRel.replace(/\.yaml$/i, '') + '.yaml');
  if (!existsSync(schemaPath)) {
    return { output: `Schema not found: '${schemaRel}'`, isError: true };
  }

  const docPath = deriveDocPath(ctx.projectRoot, schemaRel);
  if (!existsSync(docPath)) {
    return { output: `Doc not found: '${relative(process.cwd(), docPath)}'`, isError: true };
  }

  const issues = validateSchema(docPath, schemaPath);
  if (issues.length === 0) {
    return { output: `PASSED — ${schemaRel}` };
  }

  const lines = [`FAILED — ${schemaRel}`];
  lines.push(...issues);
  return { output: lines.join('\n'), isError: true };
}

async function runAll(
  ctx: CmdContext,
  schemaDir: string,
): Promise<CmdResult> {
  const schemas = findSchemas(schemaDir);
  if (schemas.length === 0) {
    return { output: 'No .yaml files found under omni.schema/', isError: true };
  }

  const lines: string[] = [];
  let allPassed = true;

  for (const schemaPath of schemas) {
    const rel = relative(schemaDir, schemaPath).replace(/\\/g, '/');
    const docPath = deriveDocPath(ctx.projectRoot, rel);
    if (!existsSync(docPath)) {
      lines.push(`SKIP   — ${rel} (no matching doc)`);
      continue;
    }

    const issues = validateSchema(docPath, schemaPath);
    if (issues.length === 0) {
      lines.push(`PASSED — ${rel}`);
    } else {
      allPassed = false;
      lines.push(`FAILED — ${rel}`);
      lines.push(...issues);
    }
  }

  return { output: lines.join('\n'), isError: !allPassed };
}
