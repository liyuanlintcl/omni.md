import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-tui";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";

const PREVIEW_LINES = 4;

function collapsibleResult(
  result: { content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
  const text = result.content?.[0]?.type === "text" ? (result.content[0] as { type: "text"; text: string }).text : "";
  if (!text) return new Text(theme.fg("dim", "(empty)"), 0, 0);
  if (options.isPartial) return new Text(theme.fg("dim", "…"), 0, 0);
  const mdTheme = getMarkdownTheme();
  if (options.expanded) return new Markdown(text, 0, 0, mdTheme);

  const lines = text.split("\n");
  if (lines.length <= PREVIEW_LINES) return new Markdown(text, 0, 0, mdTheme);

  const preview = lines.slice(0, PREVIEW_LINES).join("\n");
  const remaining = lines.length - PREVIEW_LINES;
  const hint = keyHint("expandTools", "to expand");
  return new Text(
    preview + "\n" +
    theme.fg("dim", `… ${remaining} more lines (${hint})`),
    0, 0,
  );
}

/** Absolute path to the lat binary, injected by `omni init`. */
const LAT = "__OMNI_BIN__";

function run(args: string[], cwd?: string): string {
  const { execSync } = require("child_process") as typeof import("child_process");
  return execSync(`${LAT} ${args.join(" ")}`, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf-8",
    timeout: 30_000,
  });
}

function tryRun(args: string[]): string {
  try {
    return run(args);
  } catch {
    return "";
  }
}

export default function (pi: ExtensionAPI) {
  // ── Tools ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "omni_search",
    label: "omni search",
    description: "Semantic search across omni.md sections using embeddings",
    promptSnippet: "Search omni.md documentation by meaning",
    promptGuidelines: [
      "Use before starting any task to find relevant design context",
      "Search results include section IDs you can pass to omni_section",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query in natural language" }),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 5)", default: 5 }),
      ),
    }),
    async execute(_id, params) {
      const args = ["search", JSON.stringify(params.query)];
      if (params.limit) args.push("--limit", String(params.limit));
      const output = tryRun(args);
      return {
        content: [{ type: "text", text: output || "No results found." }],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("omni search ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
    renderResult: collapsibleResult,
  });

  pi.registerTool({
    name: "omni_section",
    label: "omni section",
    description:
      "Show full content of a omni.md section with outgoing/incoming refs",
    promptSnippet: "Read a specific omni.md section",
    parameters: Type.Object({
      query: Type.String({
        description:
          'Section ID or name (e.g. "cli#init", "Tests#User login")',
      }),
    }),
    async execute(_id, params) {
      const output = tryRun(["section", JSON.stringify(params.query)]);
      return {
        content: [
          { type: "text", text: output || "Section not found." },
        ],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("omni section ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
    renderResult: collapsibleResult,
  });

  pi.registerTool({
    name: "omni_locate",
    label: "omni locate",
    description:
      "Find a section by name (exact, subsection tail, or fuzzy match)",
    promptSnippet: "Find a omni.md section by name",
    parameters: Type.Object({
      query: Type.String({ description: "Section name to locate" }),
    }),
    async execute(_id, params) {
      const output = tryRun(["locate", JSON.stringify(params.query)]);
      return {
        content: [
          { type: "text", text: output || "No sections matching query." },
        ],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("omni locate ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "omni_check",
    label: "omni check",
    description:
      "Validate all wiki links and code refs in omni.md. Returns errors or 'All checks passed'",
    promptSnippet: "Validate omni.md links and code refs",
    parameters: Type.Object({}),
    async execute() {
      try {
        const output = run(["check"]);
        return { content: [{ type: "text", text: output }] };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        return {
          content: [{ type: "text", text: e.stdout || e.stderr || "Check failed" }],
          isError: true,
        };
      }
    },
    renderCall(_args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("omni check")),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "omni_expand",
    label: "omni expand",
    description:
      "Expand [[refs]] in text to resolved file locations and context",
    promptSnippet: "Resolve [[wiki links]] in text",
    parameters: Type.Object({
      text: Type.String({ description: "Text containing [[refs]] to expand" }),
    }),
    async execute(_id, params) {
      const output = tryRun(["expand", JSON.stringify(params.text)]);
      return {
        content: [{ type: "text", text: output || params.text }],
      };
    },
    renderCall(args, theme) {
      const preview = args.text.length > 60 ? args.text.slice(0, 60) + "…" : args.text;
      return new Text(
        theme.fg("toolTitle", theme.bold("omni expand ")) +
        theme.fg("dim", `"${preview}"`),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "omni_refs",
    label: "omni refs",
    description: "Find what references a given section",
    promptSnippet: "Find incoming references to a omni.md section",
    parameters: Type.Object({
      query: Type.String({
        description: 'Section ID (e.g. "cli#init", "file#Section")',
      }),
    }),
    async execute(_id, params) {
      const output = tryRun(["refs", JSON.stringify(params.query)]);
      return {
        content: [{ type: "text", text: output || "No references found." }],
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("omni refs ")) +
        theme.fg("dim", `"${args.query}"`),
        0, 0,
      );
    },
  });

  // ── Message renderers ────────────────────────────────────────────

  pi.registerMessageRenderer("lat-reminder", (message, { expanded }, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    if (expanded) {
      box.addChild(new Text(theme.fg("accent", "omni.md"), 0, 0));
      box.addChild(new Markdown(message.content, 0, 0, getMarkdownTheme()));
    } else {
      const hint = keyHint("expandTools", "to expand");
      box.addChild(new Text(
        theme.fg("accent", "omni.md") + " " +
        theme.fg("dim", `Search omni.md before starting work. Keep omni.md/ in sync. (${hint})`),
        0, 0,
      ));
    }
    return box;
  });

  pi.registerMessageRenderer("lat-check", (message, { expanded }, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    if (expanded) {
      box.addChild(new Text(theme.fg("warning", "omni check"), 0, 0));
      box.addChild(new Markdown(message.content, 0, 0, getMarkdownTheme()));
    } else {
      const hint = keyHint("expandTools", "to expand");
      const firstLine = message.content.split("\n")[0];
      box.addChild(new Text(
        theme.fg("warning", "omni check") + " " +
        theme.fg("dim", `${firstLine} (${hint})`),
        0, 0,
      ));
    }
    return box;
  });

  // ── Lifecycle hooks ────────────────────────────────────────────────

  // Guard to prevent agent_end from firing twice per prompt (infinite loop)
  let agentEndFired = false;

  pi.on("before_agent_start", async () => {
    agentEndFired = false;

    const reminder = [
      "Before starting work, run `omni_search` with one or more queries describing the user's intent.",
      "ALWAYS do this, even when the task seems straightforward — search results may reveal critical design details, protocols, or constraints.",
      "Use `omni_section` to read the full content of relevant matches.",
      "Do not read files, write code, or run commands until you have searched.",
      "",
      "Remember: `omni.md/` must stay in sync with the codebase. If you change code, update the relevant sections in `omni.md/` and run `omni_check` before finishing.",
    ].join("\n");

    return {
      message: {
        customType: "lat-reminder",
        content: reminder,
        display: true,
      },
    };
  });

  pi.on("agent_end", async () => {
    // Don't fire twice per prompt — prevents infinite loop
    if (agentEndFired) return;
    agentEndFired = true;

    // Run omni check
    let checkOutput: string;
    let checkFailed = false;
    try {
      checkOutput = run(["check"]);
    } catch (err: unknown) {
      checkFailed = true;
      checkOutput = (err as { stdout?: string }).stdout || "";
    }

    // Run git diff --numstat to check if omni.md/ is in sync
    let needsSync = false;
    let codeLines = 0;
    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      const numstat = execSync("git diff HEAD --numstat", {
        encoding: "utf-8",
        cwd: process.cwd(),
      });

      let latMdLines = 0;
      for (const line of numstat.split("\n")) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const added = parseInt(parts[0], 10) || 0;
        const removed = parseInt(parts[1], 10) || 0;
        const file = parts[2];
        const changed = added + removed;
        if (file.startsWith("omni.md/")) {
          latMdLines += changed;
        } else if (/\.(ts|tsx|js|jsx|py|rs|go|c|h)$/.test(file)) {
          codeLines += changed;
        }
      }

      if (codeLines >= 5) {
        const effectiveLatMd = latMdLines === 0 ? 0 : Math.max(latMdLines, 1);
        needsSync = effectiveLatMd < codeLines * 0.05;
      }
    } catch {
      // git not available or no HEAD — skip diff check
    }

    if (!checkFailed && !needsSync) return;

    const parts: string[] = [];
    if (checkFailed && needsSync) {
      parts.push(
        `\`omni check\` found errors AND the codebase has changes (${codeLines} lines) with no updates to \`omni.md/\`. Before finishing:`,
        "",
        "1. Update `omni.md/` to reflect your code changes — run `omni_search` to find relevant sections.",
        "2. Run `omni_check` until it passes.",
      );
    } else if (checkFailed) {
      parts.push(
        "`omni check` failed. Run `omni_check`, fix the errors, and repeat until it passes.",
      );
    } else {
      parts.push(
        `The codebase has changes (${codeLines} lines) but \`omni.md/\` was not updated. Update \`omni.md/\` to be in sync with the changes — run \`omni_search\` to find relevant sections. Run \`omni_check\` at the end.`,
      );
    }

    pi.sendMessage(
      { customType: "lat-check", content: parts.join("\n"), display: true },
      { deliverAs: "followUp", triggerTurn: true },
    );
  });
}
