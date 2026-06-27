import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import xdg from '@folder/xdg';

// ── XDG config directory ────────────────────────────────────────────

export function getConfigDir(): string {
  return join(xdg().config, 'omni');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

// ── Config read/write ───────────────────────────────────────────────

export type OmniConfig = {
  llm_key?: string;
};

export function readConfig(): OmniConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    process.stderr.write(
      `Error: failed to parse config ${configPath}: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }
}

export function writeConfig(config: OmniConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n');
}

// ── Centralized LLM key resolution ─────────────────────────────────

/**
 * Returns the LLM key from (in priority order):
 * 1. OMNI_LLM_KEY environment variable
 * 2. OMNI_LLM_KEY_FILE — path to a file containing the key
 * 3. OMNI_LLM_KEY_HELPER — shell command that prints the key
 * 4. llm_key field in ~/.config/omni/config.json
 *
 * Returns undefined if none is set.
 */
export function getLlmKey(): string | undefined {
  const envKey = process.env.OMNI_LLM_KEY;
  if (envKey) return envKey;

  const file = process.env.OMNI_LLM_KEY_FILE;
  if (file) {
    const content = readFileSync(file, 'utf-8').trim();
    if (!content) {
      throw new Error(`OMNI_LLM_KEY_FILE (${file}) is empty.`);
    }
    return content;
  }

  const helper = process.env.OMNI_LLM_KEY_HELPER;
  if (helper) {
    const result = execSync(helper, {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();
    if (!result) {
      throw new Error('OMNI_LLM_KEY_HELPER command returned an empty string.');
    }
    return result;
  }

  const config = readConfig();
  if (config.llm_key) return config.llm_key;

  return undefined;
}
