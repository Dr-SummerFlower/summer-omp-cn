import { clearSubmittedText } from "./helpers/draft";
import { t } from "@oh-my-pi/pi-i18n";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CompactionCancelledError } from "@oh-my-pi/pi-agent-core/compaction";
import { logger, setProjectDir } from "@oh-my-pi/pi-utils";
import { clearClaudePluginRootsCache } from "../discovery/helpers";
import { rebindMemoryBackendForCwd } from "../hindsight/backend";
import { memoryStatsUnavailableMessage, resolveMemoryBackend } from "../memory-backend";
import type { AgentSession, FreshSessionResult, HandoffResult } from "../session/agent-session";
import { COMPACT_MODES, parseCompactArgs } from "../session/compact-modes";
import { buildReplanTitleContext, USER_INTERRUPT_LABEL } from "../session/messages";
import { resolveResumableSession } from "../session/session-listing";
import { toggleSessionPin } from "../session/session-pins";
import {
	cleanSourceCheckoutIfConfigured,
	createSessionWorktree,
	defaultSessionWorktreeBranch,
	formatSessionWorktreeSummary,
	type SessionWorktree,
} from "../session/session-worktree";
import { formatShakeSummary, type ShakeMode } from "../session/shake-types";
import { discoverTitleSystemPromptFile, resolvePromptInput } from "../system-prompt";
import { isLowSignalTitleInput } from "../tiny/text";
import { resolveToCwd } from "../tools/path-utils";
import { commandConsumed, errorMessage, usage } from "./helpers/parse";
import { handleSshAcp } from "./helpers/ssh";
import type {
	ParsedSlashCommand,
	SlashCommandResult,
	SlashCommandRuntime,
	SlashCommandSpec,
	TuiSlashCommandRuntime,
} from "./types";

function formatFreshSessionResult(result: FreshSessionResult): string {
	const stateLabel =
		result.closedProviderSessions === 1 ? t("common.status.providerState") : t("common.status.providerStates");
	return t("common.status.providerSessionStarted", {
		count: result.closedProviderSessions,
		states: stateLabel,
	});
}

/** Null reports no usable title; undefined silently discards an invalidated request. */
async function generateRenameTitle(session: AgentSession, signal?: AbortSignal): Promise<string | null | undefined> {
	const { sessionManager } = session;
	const context = buildReplanTitleContext(session.messages);
	if (!context || isLowSignalTitleInput(context)) return null;
	const revision = sessionManager.reserveTitleRevision();
	const sessionId = sessionManager.getSessionId();
	const titleSignal = session.titleGenerationSignal;
	const title = await session.generateTitle(context, undefined, signal);
	return !titleSignal.aborted &&
		sessionManager.getSessionId() === sessionId &&
		sessionManager.titleRevision === revision
		? title
		: undefined;
}

export const shutdownHandlerTui = (
	_command: ParsedSlashCommand,
	runtime: TuiSlashCommandRuntime,
): SlashCommandResult => {
	clearSubmittedText(runtime);
	void runtime.ctx.shutdown();
	return commandConsumed();
};

/** Parse the `/shake` subcommand into a {@link ShakeMode}; empty defaults to elide. */
function parseShakeMode(args: string): ShakeMode | { error: string } {
	const verb = args.trim().toLowerCase();
	if (verb === "" || verb === "elide") return "elide";
	if (verb === "images") return "images";
	if (verb === "thinking") return "thinking";
	return { error: t("slash.shake.unknownMode", { mode: verb }) };
}

/** Format the session's workspace directories (cwd + additional) for display. */
function formatWorkspaceDirectories(runtime: SlashCommandRuntime, note?: string): string {
	const cwd = runtime.sessionManager.getCwd();
	const additional = runtime.sessionManager.getAdditionalDirectories();
	const lines = [
		t("slash.workspace.directoriesHeader"),
		t("slash.workspace.workingDirectoryEntry", { cwd }),
		...additional.map(d => `  ${d}`),
	];
	return note ? `${note}\n${lines.join("\n")}` : lines.join("\n");
}
async function fatalMoveFailure(text: string, runtime: SlashCommandRuntime): Promise<SlashCommandResult> {
	await runtime.output(text);
	await runtime.session.dispose();
	return commandConsumed();
}

/** A move rollback failed: re-align the workspace to wherever the session ended up and report it. */
async function reportFailedRollback(runtime: SlashCommandRuntime, rollbackError: unknown): Promise<SlashCommandResult> {
	const actual = runtime.sessionManager.getCwd();
	try {
		await rescopeHeadlessToCwd(runtime, actual);
	} catch {
		return fatalMoveFailure(
			t("slash.move.rollbackFailedRealign", { reason: errorMessage(rollbackError), path: actual }),
			runtime,
		);
	}
	return usage(t("slash.move.rollbackFailed", { reason: errorMessage(rollbackError), path: actual }), runtime);
}

/**
 * Relocate the headless session to `resolvedPath` (an existing directory):
 * flush settings, move the session file, re-scope the process, rolling back
 * on failure. Returns a result when the move did not complete; `undefined`
 * on success so the caller can report its own confirmation.
 */
async function relocateHeadlessSession(
	runtime: SlashCommandRuntime,
	resolvedPath: string,
): Promise<SlashCommandResult | undefined> {
	try {
		await runtime.settings.flush();
	} catch (err) {
		return usage(t("slash.move.saveFailed", { reason: errorMessage(err) }), runtime);
	}
	const previousState = runtime.sessionManager.captureState();
	try {
		await runtime.session.moveSession(resolvedPath);
	} catch (err) {
		return usage(t("slash.move.failed", { reason: errorMessage(err) }), runtime);
	}
	try {
		setProjectDir(resolvedPath);
	} catch (err) {
		try {
			await runtime.sessionManager.rollbackMove(previousState);
		} catch (rollbackError) {
			return reportFailedRollback(runtime, rollbackError);
		}
		return usage(t("slash.move.failed", { reason: errorMessage(err) }), runtime);
	}
	try {
		await rescopeHeadlessToCwd(runtime, resolvedPath);
	} catch (err) {
		try {
			await runtime.sessionManager.rollbackMove(previousState);
			await rescopeHeadlessToCwd(runtime, previousState.cwd);
		} catch (rollbackError) {
			return reportFailedRollback(runtime, rollbackError);
		}
		return usage(t("slash.move.failed", { reason: errorMessage(err) }), runtime);
	}
	await runtime.notifyConfigChanged?.();
	await runtime.notifyTitleChanged?.();
	return undefined;
}

export const BUILTIN_LIFECYCLE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "ssh",
		icon: "host",
		get description() {
			return t("slash.ssh.description");
		},
		get acpDescription() {
			return t("slash.ssh.acpDescription");
		},
		inlineHint: "<subcommand>",
		subcommands: [
			{
				name: "add",
				get description() {
					return t("slash.ssh.sub.add.description");
				},
				usage: "<name> --host <host> [--user <user>] [--port <port>] [--key <keyPath>] [--scope project|user]",
			},
			{
				name: "list",
				get description() {
					return t("slash.ssh.sub.list.description");
				},
			},
			{
				name: "remove",
				get description() {
					return t("slash.ssh.sub.remove.description");
				},
				usage: "<name> [--scope project|user]",
			},
			{
				name: "help",
				get description() {
					return t("slash.ssh.sub.help.description");
				},
			},
		],
		allowArgs: true,
		handle: handleSshAcp,
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleSSHCommand(command.text);
		},
	},
	{
		name: "new",
		icon: "plus",
		get description() {
			return t("slash.new.description");
		},
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleClearCommand();
		},
	},
	{
		name: "fresh",
		icon: "restart",
		get description() {
			return t("slash.fresh.description");
		},
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.session.isStreaming
				? t("slash.fresh.autocomplete.streaming")
				: t("slash.fresh.autocomplete.ready"),
		handle: async (_command, runtime) => {
			const result = runtime.session.freshSession();
			if (!result) {
				await runtime.output(t("slash.fresh.waitForResponse"));
				return commandConsumed();
			}
			await runtime.output(formatFreshSessionResult(result));
			return commandConsumed();
		},
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleFreshCommand();
		},
	},
	{
		name: "clear",
		icon: "eraser",
		get description() {
			return t("slash.clear.description");
		},
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.session.isStreaming
				? t("slash.clear.autocomplete.streaming")
				: t("slash.clear.autocomplete.ready"),
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleResetContextCommand();
		},
	},
	{
		name: "delete",
		icon: "trash",
		get description() {
			return t("slash.delete.description");
		},
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleDeleteCommand();
		},
	},
	{
		name: "compact",
		icon: "compress",
		get description() {
			return t("slash.compact.description");
		},
		get acpDescription() {
			return t("slash.compact.acpDescription");
		},
		subcommands: COMPACT_MODES.map(mode => ({
			name: mode.name,
			get description() {
				return t(mode.descriptionKey);
			},
			usage: mode.rejectsFocus ? undefined : "[focus]",
		})),
		acpInputHint: `[${COMPACT_MODES.map(mode => mode.name).join("|")}] [focus]`,
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const ctxUsage = runtime.ctx.session.getContextUsage();
			return ctxUsage
				? t("slash.compact.autocomplete.used", { percent: Math.round(ctxUsage.percent) })
				: t("slash.compact.autocomplete.unavailable");
		},
		handle: async (command, runtime) => {
			const parsed = parseCompactArgs(command.args);
			if ("error" in parsed) return usage(parsed.error, runtime);
			const runCompact = async (): Promise<void> => {
				const before = runtime.session.getContextUsage?.();
				const beforeTokens = before?.tokens;
				try {
					await runtime.session.compact(parsed.instructions, parsed.mode ? { mode: parsed.mode } : undefined);
				} catch (err) {
					// RPC `abort` and ACP `session/cancel` propagate their explicit
					// USER_INTERRUPT_LABEL through the compaction abort signal. The client
					// already saw the interrupt it sent; emitting anything here would
					// append an out-of-turn chunk. Other cancellations (including an
					// extension veto) remain visible.
					if (err instanceof CompactionCancelledError && err.cause === USER_INTERRUPT_LABEL) return;
					// Compaction precondition failures (no model, already compacted, too
					// small) and provider errors propagate as plain Errors; surface them
					// via runtime.output so they don't fail the ACP prompt turn.
					await runtime.output(t("slash.compact.failed", { reason: errorMessage(err) }));
					return;
				}
				const after = runtime.session.getContextUsage?.();
				const afterTokens = after?.tokens;
				if (beforeTokens != null && afterTokens != null) {
					const saved = beforeTokens - afterTokens;
					await runtime.output(
						t("slash.compact.completeWithTokens", { before: beforeTokens, after: afterTokens, saved }),
					);
				} else {
					await runtime.output(t("slash.compact.complete"));
				}
			};
			// Provider-backed: background-dispatch under RPC so the serialized command
			// queue stays free for `abort` (SlashCommandRuntime.runCommandInBackground).
			// ACP/TUI have no such hook and keep the inline await.
			if (runtime.runCommandInBackground) {
				runtime.runCommandInBackground(runCompact);
				return commandConsumed();
			}
			await runCompact();
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			const parsed = parseCompactArgs(command.args);
			clearSubmittedText(runtime);
			if ("error" in parsed) {
				runtime.ctx.showWarning(parsed.error);
				return;
			}
			await runtime.ctx.handleCompactCommand(parsed.instructions, parsed.mode);
		},
	},
	{
		name: "shake",
		icon: "vibrate",
		get description() {
			return t("slash.shake.description");
		},
		get acpDescription() {
			return t("slash.shake.acpDescription");
		},
		subcommands: [
			{
				name: "elide",
				get description() {
					return t("slash.shake.sub.elide.description");
				},
			},
			{
				name: "images",
				get description() {
					return t("slash.shake.sub.images.description");
				},
			},
			{
				name: "thinking",
				get description() {
					return t("slash.shake.sub.thinking.description");
				},
			},
		],
		acpInputHint: "[elide|images|thinking]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const mode = parseShakeMode(command.args);
			if (typeof mode !== "string") return usage(mode.error, runtime);
			const result = await runtime.session.shake(mode);
			await runtime.output(formatShakeSummary(result));
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const mode = parseShakeMode(command.args);
			if (typeof mode !== "string") {
				runtime.ctx.showWarning(mode.error);
				return;
			}
			await runtime.ctx.handleShakeCommand(mode);
		},
	},
	{
		name: "handoff",
		icon: "handoff",
		get description() {
			return t("slash.handoff.description");
		},
		get acpDescription() {
			return t("slash.handoff.description");
		},
		inlineHint: "[focus instructions]",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) {
				return usage(t("slash.handoff.waitForResponse"), runtime);
			}
			if (runtime.session.isGeneratingHandoff) {
				return usage(t("slash.handoff.inProgress"), runtime);
			}
			const runHandoff = async (): Promise<void> => {
				let result: HandoffResult | undefined;
				try {
					result = await runtime.session.handoff(command.args || undefined);
				} catch (err) {
					const message = errorMessage(err);
					// A user interrupt (ACP `session/cancel`, TUI Esc) already settled the
					// owning turn: `AgentSession.abort()` forwards its reason into the
					// handoff abort controller, and `throwIfHandoffAborted` rethrows a
					// reasoned abort verbatim — so the throw arrives as
					// `USER_INTERRUPT_LABEL`, not "Handoff cancelled". Emitting anything
					// here would append an out-of-turn chunk after the client already saw
					// `stopReason: "cancelled"`, so consume silently.
					if (message === USER_INTERRUPT_LABEL) {
						return;
					}
					// `session.handoff()` normalizes an unreasoned cancellation to this
					// exact message; every other throw is a real failure (no model
					// selected, nothing to hand off, already compacted, provider error)
					// and is surfaced verbatim behind the same "<verb> failed:" prefix
					// `/compact` uses.
					if (message === "Handoff cancelled") {
						await runtime.output(t("slash.handoff.cancelled"));
						return;
					}
					// Persist the real failure so it stays debuggable after the client
					// message scrolls away (same rationale as the TUI path, #7993).
					logger.error("Handoff failed", { error: message });
					await runtime.output(t("slash.handoff.failed", { reason: message }));
					return;
				}
				if (!result) {
					await runtime.output(t("slash.handoff.cancelled"));
					return;
				}
				// `savedPath` is deliberately not reported: `SessionHandoff` only writes
				// the document to disk when `options.autoTriggered` is set, which the
				// user-invoked path never passes.
				await runtime.output(t("slash.handoff.succeeded"));
			};
			if (runtime.runCommandInBackground) {
				runtime.runCommandInBackground(runHandoff);
				return commandConsumed();
			}
			await runHandoff();
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			const customInstructions = command.args || undefined;
			clearSubmittedText(runtime);
			await runtime.ctx.handleHandoffCommand(customInstructions);
		},
	},
	{
		name: "resume",
		icon: "history",
		get description() {
			return t("slash.resume.description");
		},
		inlineHint: "[session id|@claude|@codex]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const sessionArg = command.args.trim();
			clearSubmittedText(runtime);
			const foreignSource = sessionArg === "@claude" ? "claude" : sessionArg === "@codex" ? "codex" : undefined;
			if (foreignSource) {
				runtime.ctx.showSessionSelector(foreignSource);
				return;
			}
			if (!sessionArg) {
				runtime.ctx.showSessionSelector();
				return;
			}
			const match = await resolveResumableSession(
				sessionArg,
				runtime.ctx.sessionManager.getCwd(),
				runtime.ctx.sessionManager.getSessionDir(),
				{ allowGlobalFallback: true },
			);
			if (!match) {
				runtime.ctx.showError(t("slash.resume.notFound", { session: sessionArg }));
				return;
			}
			await runtime.ctx.handleResumeSession(match.session.path);
		},
	},
	{
		name: "pin",
		icon: "pin",
		get description() {
			return t("slash.pin.description");
		},
		inlineHint: "[session id]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const sessionArg = command.args.trim();
			let sessionId: string | undefined;
			if (sessionArg) {
				const match = await resolveResumableSession(
					sessionArg,
					runtime.cwd,
					runtime.sessionManager.getSessionDir(),
					{ allowGlobalFallback: true },
				);
				if (!match) {
					return usage(t("slash.pin.notFound", { session: sessionArg }), runtime);
				}
				sessionId = match.session.id;
			} else {
				sessionId = runtime.sessionManager.getSessionId();
				if (!sessionId) {
					return usage(t("slash.pin.noActive"), runtime);
				}
			}
			const pinned = await toggleSessionPin(sessionId);
			await runtime.output(pinned ? t("slash.pin.pinned") : t("slash.pin.unpinned"));
			return commandConsumed();
		},
	},
	{
		name: "btw",
		icon: "question",
		get description() {
			return t("slash.btw.description");
		},
		inlineHint: "[question]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const question = command.text.slice(`/${command.name}`.length).trim();
			clearSubmittedText(runtime);
			await runtime.ctx.handleBtwCommand(question);
		},
	},
	{
		name: "tan",
		icon: "rocket",
		get description() {
			return t("slash.tan.description");
		},
		inlineHint: "<work>",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const work = command.text.slice(`/${command.name}`.length).trim();
			clearSubmittedText(runtime);
			await runtime.ctx.handleTanCommand(work);
		},
	},
	{
		name: "omfg",
		icon: "rule",
		get description() {
			return t("slash.omfg.description");
		},
		inlineHint: "<complaint>",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const complaint = command.text.slice(`/${command.name}`.length).trim();
			clearSubmittedText(runtime);
			await runtime.ctx.handleOmfgCommand(complaint);
		},
	},
	{
		name: "cleanse",
		icon: "stethoscope",
		get description() {
			return t("slash.cleanse.description");
		},
		inlineHint: "[request] [--all]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const args = command.text.slice(`/${command.name}`.length).trim();
			clearSubmittedText(runtime);
			await runtime.ctx.handleCleanseCommand(args);
		},
	},
	{
		name: "retry",
		icon: "redo",
		get description() {
			return t("slash.retry.description");
		},
		handle: async (_command, runtime) => {
			if (runtime.session.isStreaming) {
				return usage(t("slash.retry.waitForResponse"), runtime);
			}
			const didRetry = await runtime.session.retry();
			if (!didRetry) {
				return usage(t("slash.retry.nothing"), runtime);
			}
			await runtime.output(t("slash.retry.started"));
			// `AgentSession.retry()` only schedules the continuation as a
			// post-prompt task; it returns before the retried turn streams. Hosts
			// whose prompt turn owns the event subscription (ACP) must stay open
			// across that turn — `AcpAgent.prompt` installs the subscription
			// before running the command and `#finishPrompt` unsubscribes, so
			// returning early would silently swallow the entire retried turn
			// (model output and tool calls). RPC and TUI omit this hook: they
			// stream the continuation through their own session subscription, and
			// blocking their command queue here would strand a follow-up `abort`.
			await runtime.keepTurnOpenUntilIdle?.();
			// `retry()` returned true, so a real agent turn is now scheduled — RPC
			// hosts must not be told this was local-only work.
			return commandConsumed({ agentInvoked: true });
		},
		handleTui: async (_command, runtime) => {
			const didRetry = await runtime.ctx.session.retry();
			if (!didRetry) {
				runtime.ctx.showStatus(t("slash.retry.nothingTui"));
			}
			clearSubmittedText(runtime);
		},
	},
	{
		name: "debug",
		icon: "bug",
		get description() {
			return t("slash.debug.description");
		},
		handleTui: async (_command, runtime) => {
			await runtime.ctx.showDebugSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "memory",
		icon: "memory",
		get description() {
			return t("slash.memory.description");
		},
		get acpDescription() {
			return t("slash.memory.acpDescription");
		},
		acpInputHint: "<subcommand>",
		subcommands: [
			{
				name: "view",
				get description() {
					return t("slash.memory.sub.view.description");
				},
			},
			{
				name: "stats",
				get description() {
					return t("slash.memory.sub.stats.description");
				},
			},
			{
				name: "diagnose",
				get description() {
					return t("slash.memory.sub.diagnose.description");
				},
			},
			{
				name: "queue",
				get description() {
					return t("slash.memory.sub.queue.description");
				},
			},
			{
				name: "sync",
				get description() {
					return t("slash.memory.sub.sync.description");
				},
			},
			{
				name: "clear",
				get description() {
					return t("slash.memory.sub.clear.description");
				},
			},
			{
				name: "reset",
				get description() {
					return t("slash.memory.sub.reset.description");
				},
			},
			{
				name: "enqueue",
				get description() {
					return t("slash.memory.sub.enqueue.description");
				},
			},
			{
				name: "rebuild",
				get description() {
					return t("slash.memory.sub.rebuild.description");
				},
			},
			{
				name: "mm list",
				get description() {
					return t("slash.memory.sub.mmList.description");
				},
			},
			{
				name: "mm show",
				get description() {
					return t("slash.memory.sub.mmShow.description");
				},
			},
			{
				name: "mm refresh",
				get description() {
					return t("slash.memory.sub.mmRefresh.description");
				},
			},
			{
				name: "mm history",
				get description() {
					return t("slash.memory.sub.mmHistory.description");
				},
			},
			{
				name: "mm seed",
				get description() {
					return t("slash.memory.sub.mmSeed.description");
				},
			},
			{
				name: "mm delete",
				get description() {
					return t("slash.memory.sub.mmDelete.description");
				},
			},
			{
				name: "mm reload",
				get description() {
					return t("slash.memory.sub.mmReload.description");
				},
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const verb = (command.args.trim().split(/\s+/)[0] ?? "").toLowerCase() || "view";
			const backend = await resolveMemoryBackend(runtime.settings);
			switch (verb) {
				case "view": {
					const payload = await backend.buildDeveloperInstructions(
						runtime.settings.getAgentDir(),
						runtime.settings,
						runtime.session,
					);
					await runtime.output(payload || t("slash.memory.viewEmpty"));
					return commandConsumed();
				}
				case "clear":
				case "reset": {
					await backend.clear(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.session.refreshBaseSystemPrompt();
					await runtime.output(t("slash.memory.cleared"));
					return commandConsumed();
				}
				case "enqueue":
				case "rebuild": {
					await backend.enqueue(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.output(t("slash.memory.enqueued"));
					return commandConsumed();
				}
				case "queue": {
					const payload = await backend.queuePreview?.({
						agentDir: runtime.settings.getAgentDir(),
						cwd: runtime.cwd,
						session: runtime.session,
					});
					await runtime.output(payload ?? t("slash.memory.queueUnavailable", { backend: backend.id }));
					return commandConsumed();
				}
				case "sync": {
					await backend.enqueue(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.output(t("slash.memory.consolidated"));
					return commandConsumed();
				}
				case "stats":
				case "diagnose": {
					const hook = verb === "stats" ? backend.stats : backend.diagnose;
					const payload = await hook?.(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.output(payload ?? memoryStatsUnavailableMessage(backend.id, verb));
					return commandConsumed();
				}
				case "mm":
					return usage(t("slash.memory.mmAcpUnsupported"), runtime);
				default:
					return usage(t("slash.memory.usage"), runtime);
			}
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleMemoryCommand(command.text);
		},
	},
	{
		name: "rename",
		icon: "pencil",
		get description() {
			return t("slash.rename.descriptionHint");
		},
		inlineHint: "[title]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const session = runtime.session;
			const sessionManager = runtime.sessionManager;
			const runRename = async (): Promise<void> => {
				const sessionId = sessionManager.getSessionId();
				const titleSignal = session.titleGenerationSignal;
				let titleRevision = sessionManager.titleRevision;
				const isCurrent = () =>
					runtime.session === session &&
					runtime.sessionManager === sessionManager &&
					!runtime.signal?.aborted &&
					!titleSignal.aborted &&
					sessionManager.getSessionId() === sessionId &&
					sessionManager.titleRevision === titleRevision;
				try {
					const generation = command.args || generateRenameTitle(session, runtime.signal);
					titleRevision = sessionManager.titleRevision;
					const title = typeof generation === "string" ? generation : await generation;
					if (!isCurrent() || title === undefined) return;
					if (!title) {
						await runtime.output(t("slash.rename.noTitle"));
						return;
					}
					const persistence = sessionManager.setSessionName(title, "user");
					titleRevision = sessionManager.titleRevision;
					const ok = await persistence;
					if (!isCurrent()) return;
					if (!ok) {
						await runtime.output(t("slash.rename.nameNotChanged"));
						return;
					}
					await runtime.notifyTitleChanged?.();
					if (!isCurrent()) return;
					await runtime.output(t("slash.rename.renamed", { title }));
				} catch (err) {
					if (!isCurrent()) return;
					if (command.args || !runtime.runCommandInBackground) throw err;
					await runtime.output(t("slash.rename.failed", { reason: errorMessage(err) }));
				}
			};
			if (!command.args && runtime.runCommandInBackground) {
				runtime.runCommandInBackground(runRename);
				return commandConsumed();
			}
			await runRename();
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const session = runtime.ctx.session;
			const sessionManager = runtime.ctx.sessionManager;
			const sessionId = sessionManager.getSessionId();
			const titleSignal = session.titleGenerationSignal;
			const generation = command.args.trim() || generateRenameTitle(session);
			const titleRevision = sessionManager.titleRevision;
			const title = typeof generation === "string" ? generation : await generation;
			if (
				runtime.ctx.session !== session ||
				runtime.ctx.sessionManager !== sessionManager ||
				titleSignal.aborted ||
				sessionManager.getSessionId() !== sessionId ||
				sessionManager.titleRevision !== titleRevision ||
				title === undefined
			)
				return;
			if (!title) {
				runtime.ctx.showStatus(t("slash.rename.noTitle"));
				return;
			}
			await runtime.ctx.handleRenameCommand(title);
		},
	},
	{
		name: "move",
		icon: "folderMove",
		get description() {
			return t("slash.move.description");
		},
		get acpDescription() {
			return t("slash.move.acpDescription");
		},
		inlineHint: "[<path>]",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage(t("slash.move.streaming"), runtime);
			if (!command.args) return usage(t("slash.move.usage"), runtime);
			const resolvedPath = resolveToCwd(command.args, runtime.cwd);
			try {
				const stat = await fs.stat(resolvedPath);
				if (!stat.isDirectory()) {
					return usage(t("slash.move.notDirectory", { path: resolvedPath }), runtime);
				}
			} catch {
				return usage(t("slash.move.notExist", { path: resolvedPath }), runtime);
			}
			const failure = await relocateHeadlessSession(runtime, resolvedPath);
			if (failure) return failure;
			await runtime.output(t("slash.move.moved", { path: runtime.sessionManager.getCwd() }));
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			runtime.ctx.editor.addToHistory(command.text);
			clearSubmittedText(runtime);
			await runtime.ctx.handleMoveCommand(command.args || undefined);
		},
	},
	{
		name: "wt",
		aliases: ["worktree"],
		icon: "folderMove",
		get description() {
			return t("slash.wt.description");
		},
		get acpDescription() {
			return t("slash.wt.acpDescription");
		},
		inlineHint: "[<branch>]",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage(t("slash.wt.streaming"), runtime);
			const branch = command.args.trim() || defaultSessionWorktreeBranch();
			const sourceCwd = runtime.sessionManager.getCwd();
			let worktree: SessionWorktree;
			try {
				worktree = await createSessionWorktree(sourceCwd, runtime.settings, branch);
			} catch (err) {
				return usage(t("slash.wt.failed", { reason: errorMessage(err) }), runtime);
			}
			const failure = await relocateHeadlessSession(runtime, worktree.path);
			if (failure) return failure;
			const cleanup = await cleanSourceCheckoutIfConfigured(sourceCwd, runtime.settings);
			if (cleanup.errorMessage !== undefined) {
				await runtime.output(t("slash.wt.cleanupWarning", { reason: cleanup.errorMessage }));
			}
			await runtime.output(formatSessionWorktreeSummary(worktree, cleanup.cleaned));
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			runtime.ctx.editor.addToHistory(command.text);
			clearSubmittedText(runtime);
			await runtime.ctx.handleWorktreeCommand(command.args || undefined);
		},
	},
	{
		name: "add-dir",
		icon: "folderPlus",
		get description() {
			return t("slash.addDir.description");
		},
		get acpDescription() {
			return t("slash.addDir.acpDescription");
		},
		inlineHint: "<path>",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage(t("slash.addDir.streaming"), runtime);
			if (!command.args) return usage(formatWorkspaceDirectories(runtime, t("slash.addDir.usage")), runtime);
			const resolved = resolveToCwd(command.args, runtime.cwd);
			try {
				const stat = await fs.stat(resolved);
				if (!stat.isDirectory()) return usage(t("slash.addDir.notDirectory", { path: resolved }), runtime);
			} catch {
				return usage(t("slash.addDir.notExist", { path: resolved }), runtime);
			}
			let added: string | null;
			try {
				added = await runtime.sessionManager.addWorkspaceDirectory(resolved);
			} catch (err) {
				return usage(errorMessage(err), runtime);
			}
			if (added === null) {
				await runtime.output(t("slash.addDir.alreadyInWorkspace", { path: resolved }));
				return commandConsumed();
			}
			await runtime.session.refreshBaseSystemPrompt();
			await runtime.output(formatWorkspaceDirectories(runtime, t("slash.addDir.added", { path: added })));
			return commandConsumed();
		},
	},
	{
		name: "remove-dir",
		icon: "folderMinus",
		get description() {
			return t("slash.removeDir.description");
		},
		get acpDescription() {
			return t("slash.removeDir.acpDescription");
		},
		inlineHint: "<path>",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage(t("slash.removeDir.streaming"), runtime);
			if (!command.args) return usage(t("slash.removeDir.usage"), runtime);
			const resolved = resolveToCwd(command.args, runtime.cwd);
			if (resolved === path.resolve(runtime.cwd)) {
				return usage(t("slash.removeDir.cannotRemoveCwd"), runtime);
			}
			let removed: string | null;
			try {
				removed = await runtime.sessionManager.removeWorkspaceDirectory(resolved);
			} catch (err) {
				return usage(errorMessage(err), runtime);
			}
			if (removed === null) {
				await runtime.output(t("slash.removeDir.notWorkspace", { path: resolved }));
				return commandConsumed();
			}
			await runtime.session.refreshBaseSystemPrompt();
			await runtime.output(formatWorkspaceDirectories(runtime, t("slash.removeDir.removed", { path: removed })));
			return commandConsumed();
		},
	},
	{
		name: "dirs",
		get description() {
			return t("slash.dirs.description");
		},
		get acpDescription() {
			return t("slash.dirs.acpDescription");
		},
		handle: async (_command, runtime) => {
			await runtime.output(formatWorkspaceDirectories(runtime));
			return commandConsumed();
		},
	},
	{
		name: "exit",
		get description() {
			return t("slash.exit.description");
		},
		handleTui: shutdownHandlerTui,
	},
	{
		name: "restart",
		icon: "restart",
		get description() {
			return t("slash.restart.description");
		},
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.restart();
		},
	},
];
async function rescopeHeadlessToCwd(runtime: SlashCommandRuntime, cwd: string): Promise<void> {
	setProjectDir(cwd);
	await runtime.settings.reloadForCwd(cwd);
	await rebindMemoryBackendForCwd(runtime.session);
	clearClaudePluginRootsCache();
	const src = discoverTitleSystemPromptFile(cwd);
	const p = await resolvePromptInput(src, "title system prompt");
	runtime.session.setTitleSystemPrompt(p);
	await runtime.session.refreshSkillsAndCommands();
	await runtime.refreshCommands?.();
	await runtime.reloadPlugins();
}
