---
lat:
  require-code-mention: true
---
# MCP

Functional tests for the MCP server. Spawns `omni mcp` against the `basic-project` fixture via the MCP client SDK and verifies each tool responds correctly.

Tests in `tests/mcp.test.ts`.

## Lists all tools
Server exposes exactly `omni_check`, `omni_expand`, `omni_locate`, `omni_refs`, `omni_search`, `omni_section`.

## omni_locate finds a section
Calling `omni_locate` with query `"Testing"` returns a result containing `dev-process#Testing`.

## omni_locate returns message for missing section
Calling `omni_locate` with a nonexistent query returns a "No sections matching" message instead of erroring.

## omni_expand expands refs
Calling `omni_expand` with text containing `[[dev-process#Testing]]` returns expanded output with a `<lat-context>` block.

## omni_expand passes through text without refs
Calling `omni_expand` with plain text (no `[[refs]]`) returns the input unchanged.

## omni_section shows section content

Calling `omni_section` with query `"notes#Second Topic"` returns the section content including the raw wiki link text, a "This section references" block with `dev-process#Testing`, and the section id.

## omni_section returns message for missing section

Calling `omni_section` with a nonexistent query returns a "No sections matching" message.

## omni_check reports errors
Calling `omni_check` against `basic-project` (which has no index file) returns an error response with `isError: true`.

## omni_search finds auth section
Semantic search via `omni_search` for a login/security query returns results containing the Authentication section. Uses the RAG replay server against the `rag` fixture.

## omni_search finds performance section
Semantic search for a latency/response-times query returns results containing the Performance section.

## omni_search returns no results message
When `OMNI_LLM_KEY` is not set, `omni_search` returns an error with `isError: true` explaining the missing key.
