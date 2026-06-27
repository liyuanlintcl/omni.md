---
lat:
  require-code-mention: true
---
# Check Code Refs

Tests for validating `@omni:` code references and required code mention coverage.

## Detects dangling code ref

Given a source file with `@omni: [[Nonexistent]]`, [[cli#check#code-refs]] should report it as pointing to a nonexistent section.

## Detects missing code mention for required file

Given a `omni.md` file with [[markdown#Frontmatter#require-code-mention]] and a leaf section not referenced by any `@omni:` comment in the codebase, [[cli#check#code-refs]] should report the uncovered section.
