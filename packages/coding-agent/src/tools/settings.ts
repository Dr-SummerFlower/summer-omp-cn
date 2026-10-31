import { combine, register } from "../config/registry";
import { cfgBashEnabled } from "../exec/settings";
import { cfgCompactionExperimentalContextManagement } from "../session/context-settings";
import { cfgEvalJs, cfgEvalPy } from "../eval/settings";
import { cfgIdaAvailable } from "../ida/install";
import { cfgLspEnabled } from "../lsp/settings";
import { cfgTaskMaxRecursionDepth } from "../task/settings";
import { t } from "@oh-my-pi/pi-i18n";

const EMPTY_STRING_ARRAY: string[] = [];

export const cfgToolsArtifactSpillThreshold = register({
	id: "tools.artifactSpillThreshold",
	type: "number",
	default: 50,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact Spill Threshold (KB)",
		description: "Tool output above this size is saved as an artifact; tail is kept inline",
		options: [
			{ value: "1", label: "1 KB", description: "~250 tokens" },
			{ value: "2.5", label: "2.5 KB", description: "~625 tokens" },
			{ value: "5", label: "5 KB", description: "~1.25K tokens" },
			{ value: "10", label: "10 KB", description: "~2.5K tokens" },
			{ value: "20", label: "20 KB", description: "~5K tokens" },
			{ value: "30", label: "30 KB", description: "~7.5K tokens" },
			{ value: "50", label: "50 KB", description: "Default; ~12.5K tokens" },
			{ value: "75", label: "75 KB", description: "~19K tokens" },
			{ value: "100", label: "100 KB", description: "~25K tokens" },
			{ value: "200", label: "200 KB", description: "~50K tokens" },
			{ value: "500", label: "500 KB", description: "~125K tokens" },
			{ value: "1000", label: "1 MB", description: "~250K tokens" },
		],
	},
});

export const cfgToolsArtifactTailBytes = register({
	id: "tools.artifactTailBytes",
	type: "number",
	default: 20,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact Tail Size (KB)",
		description: "Amount of tail content kept inline when output spills to artifact",
		options: [
			{ value: "1", label: "1 KB", description: "~250 tokens" },
			{ value: "2.5", label: "2.5 KB", description: "~625 tokens" },
			{ value: "5", label: "5 KB", description: "~1.25K tokens" },
			{ value: "10", label: "10 KB", description: "~2.5K tokens" },
			{ value: "20", label: "20 KB", description: "Default; ~5K tokens" },
			{ value: "50", label: "50 KB", description: "~12.5K tokens" },
			{ value: "100", label: "100 KB", description: "~25K tokens" },
			{ value: "200", label: "200 KB", description: "~50K tokens" },
		],
	},
});

export const cfgToolsArtifactHeadBytes = register({
	id: "tools.artifactHeadBytes",
	type: "number",
	default: 20,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact Head Size (KB)",
		description: t("tui.ca.tools.settings.amountOfHeadContentKeptInline"),
		options: [
			{ value: "0", label: "0 KB", description: "Disabled; tail-only truncation" },
			{ value: "1", label: "1 KB", description: "~250 tokens" },
			{ value: "2.5", label: "2.5 KB", description: "~625 tokens" },
			{ value: "5", label: "5 KB", description: "~1.25K tokens" },
			{ value: "10", label: "10 KB", description: "~2.5K tokens" },
			{ value: "20", label: "20 KB", description: "Default; ~5K tokens" },
			{ value: "50", label: "50 KB", description: "~12.5K tokens" },
			{ value: "100", label: "100 KB", description: "~25K tokens" },
			{ value: "200", label: "200 KB", description: "~50K tokens" },
		],
	},
});

export const cfgToolsOutputMaxColumns = register({
	id: "tools.outputMaxColumns",
	type: "number",
	default: 768,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Output Column Cap",
		description: t("tui.ca.tools.settings.perLineByteCapForStreaming"),
		options: [
			{ value: "0", label: "Off", description: "No per-line cap" },
			{ value: "256", label: "256", description: "Tight" },
			{ value: "512", label: "512" },
			{ value: "768", label: "768", description: "Default" },
			{ value: "1024", label: "1024" },
			{ value: "2048", label: "2048" },
			{ value: "4096", label: "4096", description: "Loose" },
		],
	},
});

export const cfgToolsArtifactTailLines = register({
	id: "tools.artifactTailLines",
	type: "number",
	default: 500,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact Tail Lines",
		description: "Maximum lines of tail content kept inline when output spills to artifact",
		options: [
			{ value: "50", label: "50 lines", description: "~250 tokens" },
			{ value: "100", label: "100 lines", description: "~500 tokens" },
			{ value: "250", label: "250 lines", description: "~1.25K tokens" },
			{ value: "500", label: "500 lines", description: "Default; ~2.5K tokens" },
			{ value: "1000", label: "1000 lines", description: "~5K tokens" },
			{ value: "2000", label: "2000 lines", description: "~10K tokens" },
			{ value: "5000", label: "5000 lines", description: "~25K tokens" },
		],
	},
});

export const cfgReadLineNumbers = register({
	id: "readLineNumbers",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Reading",
		label: "Line Numbers",
		description: "Prepend line numbers to read tool output by default",
	},
});

export const cfgReadDefaultLimit = register({
	id: "read.defaultLimit",
	type: "number",
	default: 300,
	ui: {
		tab: "files",
		group: "Reading",
		label: "Default Read Limit",
		description: "Default number of lines returned when agent calls read without a limit",
		options: [
			{ value: "200", label: "200 lines" },
			{ value: "300", label: "300 lines" },
			{ value: "500", label: "500 lines" },
			{ value: "1000", label: "1000 lines" },
			{ value: "5000", label: "5000 lines" },
		],
	},
});

export const cfgReadRenderMarkdown = register({
	id: "read.renderMarkdown",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Reading",
		label: "Markdown Previews",
		description: "Render Markdown read results as formatted terminal Markdown previews instead of raw source",
	},
});

export const cfgReadSummarizeEnabled = register({
	id: "read.summarize.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Read Summaries",
		description: "Return structural code summaries when read is called without an explicit selector",
	},
});

export const cfgReadSummarizeProse = register({
	id: "read.summarize.prose",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Prose Summaries",
		description: "Return structural summaries for Markdown and plain text reads",
	},
});

export const cfgReadSummarizeMinBodyLines = register({
	id: "read.summarize.minBodyLines",
	type: "number",
	default: 4,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Read Summary Body Lines",
		description: "Minimum multiline body or literal length before read summaries collapse it",
	},
});

export const cfgReadSummarizeMinCommentLines = register({
	id: "read.summarize.minCommentLines",
	type: "number",
	default: 6,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Read Summary Comment Lines",
		description: "Minimum multiline block comment length before read summaries collapse it",
	},
});

export const cfgReadSummarizeMinTotalLines = register({
	id: "read.summarize.minTotalLines",
	type: "number",
	default: 100,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Read Summary Minimum File Length",
		description: "Files with fewer total lines are read verbatim instead of structurally summarized",
	},
});

export const cfgReadSummarizeUnfoldUntil = register({
	id: "read.summarize.unfoldUntil",
	type: "number",
	default: 50,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Read Summary Unfold Target",
		description: t("tui.ca.tools.settings.bfsUnfoldElidableSpansUntilThe"),
	},
});

export const cfgReadSummarizeUnfoldLimit = register({
	id: "read.summarize.unfoldLimit",
	type: "number",
	default: 100,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "Read Summary Unfold Ceiling",
		description: t("tui.ca.tools.settings.hardCeilingOnSummarySizeWhile"),
	},
});

export const cfgReadToolResultPreview = register({
	id: "read.toolResultPreview",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Reading",
		label: "Inline Read Previews",
		description: "Render read tool results inline in the transcript instead of summary rows",
	},
});

// ────────────────────────────────────────────────────────────────────────
// Tools
// ────────────────────────────────────────────────────────────────────────

// Tool approval policies
export const cfgToolsApproval = register({
	id: "tools.approval",
	type: "record",
	default: {},
	ui: {
		tab: "interaction",
		group: "Approvals",
		label: "Tool Approval Policies",
		description: t("tui.ca.tools.settings.perToolApprovalPoliciesSetTo"),
	},
});

// Default tool approval mode (interaction tab, but governs the tool wrapper).
//   "always-ask" — auto-approves read-tier tools only; prompts for write/exec.
//   "write"      — auto-approves read and write-tier tools; prompts for exec.
//   "yolo"       — auto-approves every tier.
export const cfgToolsApprovalMode = register({
	id: "tools.approvalMode",
	type: "enum",
	values: ["always-ask", "write", "yolo"] as const,
	default: "yolo",
	ui: {
		tab: "interaction",
		group: "Approvals",
		label: "Tool Approval",
		description: t("tui.ca.tools.settings.defaultApprovalBehaviorForToolCalls"),
		options: [
			{
				value: "always-ask",
				label: "Always ask",
				description: "Auto-approve read-only tools; require confirmation for write and exec tools.",
			},
			{
				value: "write",
				label: "Write",
				description: t("tui.ca.tools.settings.autoApproveReadOnlyAndWrite"),
			},
			{
				value: "yolo",
				label: "Yolo",
				description: t("tui.ca.tools.settings.autoApproveReadWriteAndExec"),
			},
		],
	},
});

// Todo tool
// Todo settings deliberately have no `protocolDefault`: protocol embedders need project-level opt-outs
// for reminder/prelude prompt injection.
export const cfgTodoEnabled = register({
	id: "todo.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Todos",
		description: "Enable the todo tool for task tracking",
	},
});

export const cfgTodoReminders = register({
	id: "todo.reminders",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Todos",
		label: "Todo Reminders",
		description: "Remind the agent to complete todos before stopping",
	},
});

export const cfgTodoRemindersMax = register({
	id: "todo.remindersMax",
	type: "number",
	default: 3,
	ui: {
		tab: "tools",
		group: "Todos",
		label: "Todo Reminder Limit",
		description: "Maximum number of todo reminders before giving up",
		options: [
			{ value: "1", label: "1 reminder" },
			{ value: "2", label: "2 reminders" },
			{ value: "3", label: "3 reminders" },
			{ value: "5", label: "5 reminders" },
		],
	},
});

export const cfgTodoEager = register({
	id: "todo.eager",
	type: "enum",
	values: ["default", "preferred", "always"] as const,
	default: "default",
	ui: {
		tab: "tools",
		group: "Todos",
		label: "Create Todos Automatically",
		description: "How strongly to push automatic todo-list creation after the first message",
		options: [
			{ value: "default", label: "Default", description: "Model decides; no automatic todo list" },
			{
				value: "preferred",
				label: "Preferred",
				description: "Suggests a todo list on the first message (reminder, not forced)",
			},
			{ value: "always", label: "Always", description: "Forces a comprehensive todo list on the first message" },
		],
	},
});

export const cfgTasksTodoClearDelay = register({
	id: "tasks.todoClearDelay",
	type: "number",
	default: 60,
	ui: {
		tab: "tools",
		group: "Todos",
		label: "Todo Auto-Clear Delay",
		description: "Delay before completed or abandoned todos are removed from the todo widget",
		options: [
			{ value: "0", label: "Instant" },
			{ value: "60", label: "1 minute", description: "Default" },
			{ value: "300", label: "5 minutes" },
			{ value: "900", label: "15 minutes" },
			{ value: "1800", label: "30 minutes" },
			{ value: "3600", label: "1 hour" },
			{ value: "-1", label: "Never" },
		],
	},
});

// Grep, glob, and AST tools
export const cfgGlobEnabled = register({
	id: "glob.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Glob",
		description: "Enable the glob tool for glob-based file lookup",
	},
});

export const cfgGrepEnabled = register({
	id: "grep.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Grep",
		description: "Enable the grep tool for regex content search",
	},
});

export const cfgGrepContextBefore = register({
	id: "grep.contextBefore",
	type: "number",
	default: 1,
	ui: {
		tab: "tools",
		group: "Grep & Browser",
		label: "Grep Context Before",
		description: "Lines of context before each grep match",
		options: [
			{ value: "0", label: "0 lines" },
			{ value: "1", label: "1 line" },
			{ value: "2", label: "2 lines" },
			{ value: "3", label: "3 lines" },
			{ value: "5", label: "5 lines" },
		],
	},
});

export const cfgGrepContextAfter = register({
	id: "grep.contextAfter",
	type: "number",
	default: 3,
	ui: {
		tab: "tools",
		group: "Grep & Browser",
		label: "Grep Context After",
		description: "Lines of context after each grep match",
		options: [
			{ value: "0", label: "0 lines" },
			{ value: "1", label: "1 line" },
			{ value: "2", label: "2 lines" },
			{ value: "3", label: "3 lines" },
			{ value: "5", label: "5 lines" },
			{ value: "10", label: "10 lines" },
		],
	},
});

export const cfgAstGrepEnabled = register({
	id: "astGrep.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "AST Grep",
		description: "Enable the ast_grep tool for structural AST search",
	},
});

export const cfgAstEditEnabled = register({
	id: "astEdit.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "AST Edit",
		description: "Enable the ast_edit tool for structural AST rewrites",
	},
});

export const cfgFindEnabled = register({
	id: "find.enabled",
	type: "enum",
	values: ["auto", "on", "off"] as const,
	default: "auto",
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Find (semantic grep)",
		description: t("tui.ca.tools.settings.enableTheFindToolNaturalLanguage"),
		options: [
			{
				value: "auto",
				label: "Auto",
				description: "Enable when the judge role resolves to a native TypeSafe jev model",
			},
			{ value: "on", label: "On", description: "Always enable, whichever model the judge role resolves to" },
			{ value: "off", label: "Off", description: "Disable the find tool" },
		],
	},
});

// Optional tools

export const cfgDebugEnabled = register({
	id: "debug.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Debug",
		description: "Enable the debug tool for DAP-based debugging",
	},
});

export const cfgLaunchEnabled = register({
	id: "launch.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Services",
		description: "Enable named bash services and proc:// supervision for shared long-running project processes",
	},
});

export const cfgImagesQuestionTimeoutMs = register({
	id: "images.questionTimeoutMs",
	type: "number",
	default: 300_000,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "Image Question Timeout",
		description: t("tui.ca.tools.settings.perRequestTimeoutForTheVision"),
		options: [
			{ value: "0", label: "Disabled" },
			{ value: "60000", label: "1 minute" },
			{ value: "120000", label: "2 minutes" },
			{ value: "180000", label: "3 minutes" },
			{ value: "300000", label: "5 minutes" },
		],
	},
});

export const cfgCheckpointEnabled = register({
	id: "checkpoint.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Checkpoint/Rewind",
		description: "Enable the checkpoint and rewind tools for context checkpointing",
	},
});

// Fetching and browser
export const cfgFetchEnabled = register({
	id: "fetch.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Read URLs",
		description: "Allow the read tool to fetch and process URLs",
	},
});

export const cfgVaultEnabled = register({
	id: "vault.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Obsidian Vault",
		description:
			"Enable the vault:// internal URL for reading and editing Obsidian vault content via the Obsidian CLI. When disabled, vault:// resolution is refused and the vault:// entry is omitted from the system prompt.",
	},
});

export const cfgGithubEnabled = register({
	id: "github.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "GitHub CLI",
		description: t("tui.ca.tools.settings.enableTheGithubToolOpBased"),
	},
});

export const cfgGithubCacheEnabled = register({
	id: "github.cache.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "GitHub",
		label: "GitHub View Cache",
		description: "Cache rendered issue/PR view output in ~/.omp/cache/github-cache.db so repeated reads are free",
	},
});

export const cfgGithubCacheSoftTtlSec = register({
	id: "github.cache.softTtlSec",
	type: "number",
	default: 300,
	ui: {
		tab: "tools",
		group: "GitHub",
		label: "GitHub Cache Soft TTL",
		description: "Within this window, cached issue/PR view rows are returned directly (seconds; default 5 minutes)",
	},
});

export const cfgGithubCacheHardTtlSec = register({
	id: "github.cache.hardTtlSec",
	type: "number",
	default: 604800,
	ui: {
		tab: "tools",
		group: "GitHub",
		label: "GitHub Cache Hard TTL",
		description: t("tui.ca.tools.settings.pastTheSoftTtlTheCached"),
	},
});

export const cfgWebSearchEnabled = register({
	id: "web_search.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Web Search",
		description: "Enable the web_search tool for live web results",
	},
});

export const cfgAskEnabled = register({
	id: "ask.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Ask",
		description: "Enable the ask tool for interactive user questions",
	},
});

// Tool execution
export const cfgToolsIntentTracing = register({
	id: "tools.intentTracing",
	type: "boolean",
	default: true,
	env: "PI_INTENT_TRACING",
	ui: {
		tab: "tools",
		group: "Execution",
		label: "Intent Tracing",
		description: "Ask the agent to describe the intent of each tool call before executing it",
	},
});

export const cfgToolsAbortOnFabricatedResult = register({
	id: "tools.abortOnFabricatedResult",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "Abort On Fabricated Tool Result",
		description: t("tui.ca.tools.settings.withInBandToolCallsStop"),
	},
});

export const cfgToolsMaxTimeout = register({
	id: "tools.maxTimeout",
	type: "number",
	default: 0,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "Max Tool Timeout",
		description: "Maximum timeout in seconds the agent can set for any tool (0 = no limit)",
		options: [
			{ value: "0", label: "No limit" },
			{ value: "30", label: "30 seconds" },
			{ value: "60", label: "60 seconds" },
			{ value: "120", label: "120 seconds" },
			{ value: "300", label: "5 minutes" },
			{ value: "600", label: "10 minutes" },
		],
	},
});

// Async jobs. RPC hosts start from the neutral background-job defaults (`protocolDefault`), as do the
// bash/eval auto-background settings.
export const cfgAsyncEnabled = register({
	id: "async.enabled",
	protocolDefault: ["rpc"],
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "Async Execution",
		description: "Enable async bash commands and background task execution",
	},
});

export const cfgAsyncMaxJobs = register({
	id: "async.maxJobs",
	protocolDefault: ["rpc"],
	type: "number",
	default: 100,
});

export const cfgToolsXdev = register({
	id: "tools.xdev",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Tools",
		description:
			"Mount rarely-used (discoverable) tools under xd:// device URLs driven via read/write instead of shipping their schemas on every request. Sessions whose explicit tool list grants read but omits write mount devices through a device-only write transport (filesystem writes stay rejected). Disable to expose every enabled tool top-level.",
	},
});

export const cfgToolsXdevDocs = register({
	id: "tools.xdevDocs",
	type: "enum",
	values: ["inline", "builtins", "catalog"] as const,
	default: "catalog",
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Prompt Docs",
		description: t("tui.ca.tools.settings.chooseWhichMountedDeviceDocsAnd"),
		options: [
			{ value: "inline", label: "All Devices", description: "Inline docs and schemas for every mounted device." },
			{
				value: "builtins",
				label: "Built-ins Only",
				description: "Inline built-in docs; fetch MCP and extension docs on demand.",
			},
			{ value: "catalog", label: "Catalog Only", description: "List every device; fetch all docs on demand." },
		],
	},
});

export const cfgToolsXdevInlineDevices = register({
	id: "tools.xdevInlineDevices",
	type: "array",
	default: EMPTY_STRING_ARRAY,
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Inline Devices",
		description:
			"When xd:// Prompt Docs is Built-ins Only, inline dynamic devices whose names match these glob patterns (for example mcp__context_mode_*). Catalog Only ignores this setting.",
	},
});

/** Settings read by `resolveBuiltinToolPlan` (`tools/index.ts`); a live session reconciles its built-ins when any changes. */
export const cfgBuiltinToolGates = combine({
	ask: cfgAskEnabled,
	astEdit: cfgAstEditEnabled,
	astGrep: cfgAstGrepEnabled,
	async: cfgAsyncEnabled,
	bash: cfgBashEnabled,
	checkpoint: cfgCheckpointEnabled,
	contextManagement: cfgCompactionExperimentalContextManagement,
	debug: cfgDebugEnabled,
	evalJs: cfgEvalJs,
	evalPy: cfgEvalPy,
	find: cfgFindEnabled,
	github: cfgGithubEnabled,
	glob: cfgGlobEnabled,
	grep: cfgGrepEnabled,
	ida: cfgIdaAvailable,
	launch: cfgLaunchEnabled,
	lsp: cfgLspEnabled,
	taskMaxRecursionDepth: cfgTaskMaxRecursionDepth,
	todo: cfgTodoEnabled,
	webSearch: cfgWebSearchEnabled,
});

/** Settings that add or remove the built-in tools they gate (`AgentSession.reconcileBuiltinTools`). */
export const cfgSessionToolGates = combine({
	builtins: cfgBuiltinToolGates,
	xdev: cfgToolsXdev,
});
