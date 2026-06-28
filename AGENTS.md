# omni.md — AGENTS.md

`omni.md` is the core parser and CLI for a markdown-based knowledge graph. In this repo it also hosts `src/schema-check/` for YAML schema validation.

## Before starting work

- Run `omni-md check md` to validate all wiki links before/after making changes.

## Commands

```bash
npm run omni-md -- check md              # validate wiki links
npm run omni-md -- check schema --dir .  # validate YAML schema
npm run omni-md -- check                 # run all checks
```

## Important files

| File | Purpose |
|---|---|
| `src/cli/index.ts` | CLI entry, subcommand registration |
| `src/cli/check.ts` | `check md` / `check code-refs` / etc. |
| `src/schema-check/schema-check.ts` | Schema validation core |
| `src/cli/schema-check.ts` | `check schema` CLI handler |
| `src/omnidoc.ts` | Link parsing, section loading, ref resolution |
| `package.json` | Dependencies and scripts |

## Schema check (`omni-md check schema`)

Validates markdown docs against YAML schema definitions (details in root `AGENTS.md`).
