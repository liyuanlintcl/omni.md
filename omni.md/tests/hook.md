---
lat:
  require-code-mention: true
---
# Hook

Functional tests for the Stop hook. Runs `omni hook claude Stop` as a subprocess against test case fixtures, with a fake `git` script injected via PATH to control `git diff HEAD --numstat` output.

Tests in `tests/hook.test.ts`.

## Exits silently when check passes and no diff

When `omni check` passes and there is no git diff output, the hook produces no stdout and no stderr — the agent stops cleanly.

## Blocks when omni check fails

When `omni check` finds errors, the hook outputs a block decision with a reason mentioning `omni check` and the error count.

## Blocks when code diff is large but omni.md/ not updated

When check passes but `git diff --numstat` shows code changes above the threshold with no `omni.md/` changes, the hook blocks with a reminder to update `omni.md/`.

## Exits silently when omni.md/ changes are proportional

When code changes are large but `omni.md/` changes exceed the 5% ratio, the hook exits silently.

## Exits silently when code diff is below threshold

When code changes are below 5 lines, the ratio check is skipped and the hook exits silently.

## Blocks with both messages when check fails and diff needs sync

When `omni check` fails and the diff also needs sync, the block reason includes both "update `omni.md/`" and "run `omni check` until it passes".

## Exits silently on second pass when check passes

On the second pass (`stop_hook_active: true`), if `omni check` passes, the hook exits silently with no output.

## Prints stderr warning on second pass when check still fails

On the second pass, if `omni check` still fails, the hook prints a warning to stderr but does not block — the loop stops.

## Ignores non-code files in diff

Files that don't match `SOURCE_EXTENSIONS` (e.g. `.md`) are not counted toward code lines, so a large markdown-only diff does not trigger a sync reminder.

## Cursor stop hook returns follow-up work instead of a Claude block

When Cursor needs more work at stop time, the hook returns a `followup_message` payload instead of Claude's `decision: "block"` shape so the agent keeps going in Cursor's native hook format.
