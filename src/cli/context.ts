import { dirname } from 'node:path';
import { styleText } from 'node:util';
import { findOmniDir } from '../omnidoc.js';
import type { CmdContext, Styler } from '../context.js';

export type { CmdContext };

function makeStyler(): Styler {
  return {
    bold: (s) => styleText('bold', s),
    dim: (s) => styleText('dim', s),
    red: (s) => styleText('red', s),
    cyan: (s) => styleText('cyan', s),
    white: (s) => styleText('white', s),
    green: (s) => styleText('green', s),
    yellow: (s) => styleText('yellow', s),
    boldWhite: (s) => styleText(['bold', 'white'], s),
  };
}

export function resolveContext(opts: {
  dir?: string;
  color?: boolean;
}): CmdContext {
  const color = opts.color !== false;
  if (!color) {
    process.env.NO_COLOR = '1';
  }

  const omniDir = findOmniDir(opts.dir) ?? '';
  if (!omniDir) {
    console.error(styleText('red', 'No omni.md directory found'));
    console.error(styleText('dim', 'Run `omni init` to create one.'));
    process.exit(1);
  }

  const projectRoot = dirname(omniDir);
  return { omniDir, projectRoot, styler: makeStyler(), mode: 'cli' };
}
