# Before starting work

- Run `omni search` to find sections relevant to your task. Read them to understand the design intent before writing code.
- Run `omni expand` on user prompts to expand any `[[refs]]` — this resolves section names to file locations and provides context.

# Post-task checklist (REQUIRED — do not skip)

After EVERY task, before responding to the user:

- [ ] Update `omni.md/` if you added or changed any functionality, architecture, tests, or behavior
- [ ] Run `omni check` — all wiki links and code refs must pass
- [ ] Do not skip these steps. Do not consider your task done until both are complete.

---

# What is omni.md?

This project uses [omni.md](https://www.npmjs.com/package/omni.md) to maintain a structured knowledge graph of its architecture, design decisions, and test specs in the `omni.md/` directory. It is a set of cross-linked markdown files that describe **what** this project does and **why** — the domain concepts, key design decisions, business logic, and test specifications. Use it to ground your work in the actual architecture rather than guessing.

# Commands

```bash
omni locate "Section Name"      # find a section by name (exact, fuzzy)
omni refs "file#Section"        # find what references a section
omni search "natural language"  # semantic search across all sections
omni expand "user prompt text"  # expand [[refs]] to resolved locations
omni check                      # validate all links and code refs
```

Run `lat --help` when in doubt about available commands or options.

If `omni search` fails because no API key is configured, explain to the user that semantic search requires a key provided via `OMNI_LLM_KEY` (direct value), `OMNI_LLM_KEY_FILE` (path to key file), or `OMNI_LLM_KEY_HELPER` (command that prints the key). Supported key prefixes: `sk-...` (OpenAI) or `vck_...` (Vercel). If the user doesn't want to set it up, use `omni locate` for direct lookups instead.

# Syntax primer

- **Section ids**: `omni.md/path/to/file#Heading#SubHeading` — full form uses project-root-relative path (e.g. `omni.md/tests/search#RAG Replay Tests`). Short form uses bare file name when unique (e.g. `search#RAG Replay Tests`, `cli#search#Indexing`).
- **Wiki links**: `[[target]]` or `[[target|alias]]` — cross-references between sections. Can also reference source code: `[[src/foo.ts#myFunction]]`.
- **Source code links**: Wiki links in `omni.md/` files can reference functions, classes, constants, and methods in TypeScript/JavaScript/Python/Rust/Go/C files. Use the full path: `[[src/config.ts#getConfigDir]]`, `[[src/server.ts#App#listen]]` (class method), `[[lib/utils.py#parse_args]]`, `[[src/lib.rs#Greeter#greet]]` (Rust impl method), `[[src/app.go#Greeter#Greet]]` (Go method), `[[src/app.h#Greeter]]` (C struct). `omni check` validates these exist.
- **Code refs**: `// @omni: [[section-id]]` (JS/TS/Rust/Go/C) or `# @omni: [[section-id]]` (Python) — ties source code to concepts

# Test specs

Key tests can be described as sections in `omni.md/` files (e.g. `tests.md`). Add frontmatter to require that every leaf section is referenced by a `// @omni:` or `# @omni:` comment in test code:

```markdown
---
lat:
  require-code-mention: true
---
# Tests

Authentication and authorization test specifications.

## User login

Verify credential validation and error handling for the login endpoint.

### Rejects expired tokens
Tokens past their expiry timestamp are rejected with 401, even if otherwise valid.

### Handles missing password
Login request without a password field returns 400 with a descriptive error.
```

Every section MUST have a description — at least one sentence explaining what the test verifies and why. Empty sections with just a heading are not acceptable. (This is a specific case of the general leading paragraph rule below.)

Each test in code should reference its spec with exactly one comment placed next to the relevant test — not at the top of the file:

```python
# @omni: [[tests#User login#Rejects expired tokens]]
def test_rejects_expired_tokens():
    ...

# @omni: [[tests#User login#Handles missing password]]
def test_handles_missing_password():
    ...
```

Do not duplicate refs. One `@omni:` comment per spec section, placed at the test that covers it. `omni check` will flag any spec section not covered by a code reference, and any code reference pointing to a nonexistent section.

# Section structure

Every section in `omni.md/` **must** have a leading paragraph — at least one sentence immediately after the heading, before any child headings or other block content. The first paragraph must be ≤250 characters (excluding `[[wiki link]]` content). This paragraph serves as the section's overview and is used in search results, command output, and RAG context — keeping it concise guarantees the section's essence is always captured.

```markdown
# Good Section

Brief overview of what this section documents and why it matters.

More detail can go in subsequent paragraphs, code blocks, or lists.

## Child heading

Details about this child topic.
```

```markdown
# Bad Section

## Child heading

Details about this child topic.
```

The second example is invalid because `Bad Section` has no leading paragraph. `omni check` validates this rule and reports errors for missing or overly long leading paragraphs.
