import { clearSubmittedText, restoreDetachedDraft } from "./helpers/draft";
import * as path from "node:path";
import { formatKeyHint } from "@oh-my-pi/pi-tui/app-keybindings";
import {
	formatModelString,
	getModelMatchPreferences,
	resolveCliModel,
	type ResolveCliModelResult,
} from "../config/model-resolver";
import type { Settings } from "../config/settings";
import { describeLoopCondition } from "../modes/loop-condition";
import { describeLoopLimitRuntime } from "../modes/loop-limit";
import type { InteractiveModeContext } from "../modes/types";
import type { AgentSession } from "../session/agent-session";
import { commandConsumed, errorMessage, usage } from "./helpers/parse";
import { handleSecurityCommand } from "./helpers/security";
import type { ParsedSlashCommand, SlashCommandSpec, TuiSlashCommandRuntime } from "./types";
import { t } from "@oh-my-pi/pi-i18n";

import { cfgComputerDisplay, cfgComputerEnabled, cfgComputerMaxHeight, cfgComputerMaxWidth } from "../tools/settings";
import { cfgSkillful } from "../session/settings";
import { formatSlowModeResetClock } from "../session/anthropic-slow-mode";
import { cfgExtendedContext } from "../session/context-settings";
import { cfgGoalEnabled } from "../goals/settings";
import { cfgPlanEnabled } from "../plan-mode/settings";

export function refreshStatusLine(ctx: InteractiveModeContext): void {
	ctx.statusLine.invalidate();
	ctx.ui.requestRender();
}

/**
 * Resolve a `/model` / `/switch` selector the way `omp bench` and `--model`
 * do: exact `provider/id`, fuzzy ids (`opus`), role aliases (`@smol`, `smol`),
 * and `:level` thinking suffixes. Unqualified selectors prefer the session's
 * `--models` scope, else the authenticated set, before the full catalog.
 */
function resolveSessionModelSelector(
	selector: string,
	session: AgentSession,
	settings: Settings,
): ResolveCliModelResult {
	const scoped = session.scopedModels.map(entry => entry.model);
	return resolveCliModel({
		cliModel: selector,
		modelRegistry: session.modelRegistry,
		availableModels: scoped.length > 0 ? scoped : undefined,
		settings,
		preferences: getModelMatchPreferences(settings),
	});
}

async function runWithDetachedModeDraft(
	command: ParsedSlashCommand,
	runtime: TuiSlashCommandRuntime,
	run: () => Promise<boolean>,
): Promise<void> {
	const { editor } = runtime.ctx;
	if (!runtime.draftDetached) editor.clearDraft();
	try {
		const submitted = await run();
		const hasAttachments = (runtime.input?.images?.length ?? 0) > 0 || (runtime.input?.imageLinks?.length ?? 0) > 0;
		if (!submitted && hasAttachments) {
			if (runtime.draftDetached) {
				// Newer typing may already sit in the editor: merge the submission
				// back beside it so each draft's image markers keep their images.
				restoreDetachedDraft(editor, command.text, runtime.input?.images, runtime.input?.imageLinks);
				return;
			}
			editor.pendingImages = [...(runtime.input?.images ?? []), ...editor.pendingImages];
			editor.pendingImageLinks = [
				...(runtime.input?.imageLinks ?? runtime.input?.images?.map(() => undefined) ?? []),
				...editor.pendingImageLinks,
			];
			editor.imageLinks = editor.pendingImageLinks.length > 0 ? editor.pendingImageLinks : undefined;
		}
	} catch (error) {
		if (runtime.draftDetached) {
			// The caller already took this draft out of the editor before
			// dispatch (Ctrl+Enter's `handleFollowUp`, or `onSubmit` for these
			// mode commands); it owns restoring the submission and reporting
			// the error so a submission that failed after newer text was typed
			// merges with it once, instead of being silently dropped here.
			throw error;
		}
		if (!editor.getText() && editor.pendingImages.length === 0) {
			editor.setText(command.text);
			editor.pendingImages = runtime.input?.images ? [...runtime.input.images] : [];
			editor.pendingImageLinks = runtime.input?.imageLinks ? [...runtime.input.imageLinks] : [];
			editor.imageLinks = editor.pendingImageLinks.length > 0 ? editor.pendingImageLinks : undefined;
		}
		runtime.ctx.showError(error instanceof Error ? error.message : String(error));
	}
}

/** `/fast status` label for the active model: "ultra" for the Ultrafast tier, "on" for priority, else "off". */
function formatFastModeStatus(session: AgentSession): string {
	if (session.isUltrafastModeEnabled()) return t("slash.fast.mode.ultra");
	return session.isFastModeEnabled() ? t("common.state.on") : t("common.state.off");
}

/**
 * `/fast [on|ultra|off|status]` for the active model: `on` selects the
 * family's `priority` tier, `ultra` the OpenAI `ultrafast` tier, `off` clears
 * either. Bare invocation toggles between off and priority. Returns the
 * user-facing reply, or `undefined` for an unknown argument.
 */
function runFastCommand(arg: string, session: AgentSession): string | undefined {
	switch (arg) {
		case "":
		case "toggle":
			return session.toggleFastMode() ? t("slash.fast.toggledOn") : t("slash.fast.toggledOff");
		case "on":
			return session.setFastMode(true) ? t("slash.fast.toggledOn") : t("slash.fast.unavailable");
		case "ultra":
		case "ultrafast":
			return session.setUltrafastMode(true) ? t("slash.fast.ultraEnabled") : t("slash.fast.ultraUnavailable");
		case "off":
			session.setFastMode(false);
			return t("slash.fast.toggledOff");
		case "status":
			return t("slash.fast.statusLine", { status: formatFastModeStatus(session) });
		default:
			return undefined;
	}
}

/**
 * `/slow [on|off|status]` for the active model: the `flex` service tier on
 * OpenAI/Google, subscription low priority (`providers.anthropic.slowMode`
 * `auto`/`off`) on Anthropic. Bare invocation toggles. Returns the user-facing
 * reply, or `undefined` for an unknown argument.
 */
function runSlowCommand(arg: string, session: AgentSession): string | undefined {
	if (arg !== "" && arg !== "toggle" && arg !== "on" && arg !== "off" && arg !== "status") return undefined;
	const anthropic = session.model?.provider === "anthropic";
	if (arg === "status") {
		const label = anthropic ? session.getAnthropicSlowModeLabel() : undefined;
		if (!session.isSlowModeEnabled()) {
			return label ? t("slash.slow.status.offWithLabel", { label }) : t("slash.slow.status.off");
		}
		if (!anthropic) return t("slash.slow.status.onFlex");
		return label ? t("slash.slow.status.onWithLabel", { label }) : t("slash.slow.status.onLowPriority");
	}
	const enabled = arg === "on" || (arg !== "off" && !session.isSlowModeEnabled());
	if (!session.setSlowMode(enabled)) return t("slash.slow.unsupported");
	if (!session.isSlowModeEnabled()) {
		return anthropic ? t("slash.slow.offAnthropic") : t("slash.slow.off");
	}
	if (!anthropic) return t("slash.slow.onFlex");
	const resetsAtSec = session.getAnthropicSlowModeLane()?.activeResetsAtSec();
	return resetsAtSec !== undefined
		? t("slash.slow.onLowPriorityUntil", { clock: formatSlowModeResetClock(resetsAtSec) })
		: t("slash.slow.onLowPriorityAuto");
}

/** `/extended-context status` label for the premium long-context window setting. */
function formatExtendedContextStatus(settings: Settings): string {
	return cfgExtendedContext.get(settings) ? t("common.state.on") : t("common.state.off");
}

/** Applies an `/extended-context` argument and returns its operator feedback. */
function applyExtendedContextCommand(settings: Settings, args: string): string | undefined {
	const arg = args.trim().toLowerCase();
	const current = cfgExtendedContext.get(settings);
	if (!arg || arg === "toggle") {
		const enabled = !current;
		cfgExtendedContext.set(settings, enabled);
		return enabled ? t("slash.extendedContext.enabled") : t("slash.extendedContext.disabled");
	}
	if (arg === "on") {
		cfgExtendedContext.set(settings, true);
		return t("slash.extendedContext.enabled");
	}
	if (arg === "off") {
		cfgExtendedContext.set(settings, false);
		return t("slash.extendedContext.disabled");
	}
	if (arg === "status") return t("slash.extendedContext.status", { status: formatExtendedContextStatus(settings) });
	return undefined;
}

/** Detailed, session-effective `/computer status` diagnostics. */
function formatComputerUseStatus(session: AgentSession): string {
	const enabled = cfgComputerEnabled.get(session.settings);
	const active = session.getEvalPreludes().some(definition => definition.name === "computer");
	const configured = {
		display: cfgComputerDisplay.get(session.settings),
		maxWidth: cfgComputerMaxWidth.get(session.settings),
		maxHeight: cfgComputerMaxHeight.get(session.settings),
	};
	return [
		enabled ? t("slash.computer.statusLine.enabled") : t("slash.computer.statusLine.disabled"),
		active ? t("slash.computer.statusLine.preludeActive") : t("slash.computer.statusLine.preludeInactive"),
		t("slash.computer.statusLine.configured", {
			display: configured.display,
			maxWidth: configured.maxWidth,
			maxHeight: configured.maxHeight,
		}),
	].join(" · ");
}

/**
 * Apply a session-scoped computer-use toggle; the session's setting listener
 * reconciles the prompt without a mid-session cache-busting rebuild.
 * The override is never persisted to settings.json.
 */
function applyComputerUseToggle(session: AgentSession, enable: boolean): string {
	const previous = cfgComputerEnabled.get(session.settings);
	cfgComputerEnabled.override(session.settings, enable);
	if (enable && !session.getEvalPreludes().some(definition => definition.name === "computer")) {
		cfgComputerEnabled.override(session.settings, previous);
		return t("slash.computer.toggle.unavailable");
	}
	return enable
		? t("slash.computer.toggle.enabled", { status: formatComputerUseStatus(session) })
		: t("slash.computer.toggle.disabled");
}

const AUTOCOMPLETE_DETAIL_LIMIT = 48;

function shortDetail(value: string, limit = AUTOCOMPLETE_DETAIL_LIMIT): string {
	const singleLine = value.replace(/\s+/g, " ").trim();
	return singleLine.length <= limit ? singleLine : `${singleLine.slice(0, limit - 1)}…`;
}

export function formatTokenCount(value: number): string {
	return value.toLocaleString();
}

export const BUILTIN_MODE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "security",
		icon: "shield",
		get description() {
			return t("slash.security.description");
		},
		allowArgs: true,
		acpInputHint: "<plan|scan|status|cancel|scans|show|import|export|validate|compare|disposition>",
		subcommands: [
			{
				name: "plan",
				get description() {
					return t("slash.security.sub.plan.description");
				},
			},
			{
				name: "scan",
				get description() {
					return t("slash.security.sub.scan.description");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.security.sub.status.description");
				},
			},
			{
				name: "cancel",
				get description() {
					return t("slash.security.sub.cancel.description");
				},
			},
			{
				name: "scans",
				get description() {
					return t("slash.security.sub.scans.description");
				},
			},
			{
				name: "show",
				get description() {
					return t("slash.security.sub.show.description");
				},
			},
			{
				name: "import",
				get description() {
					return t("slash.security.sub.import.description");
				},
			},
			{
				name: "export",
				get description() {
					return t("slash.security.sub.export.description");
				},
			},
			{
				name: "validate",
				get description() {
					return t("slash.security.sub.validate.description");
				},
			},
			{
				name: "compare",
				get description() {
					return t("slash.security.sub.compare.description");
				},
			},
			{
				name: "disposition",
				get description() {
					return t("slash.security.sub.disposition.description");
				},
			},
		],
		handle: handleSecurityCommand,
	},
	{
		name: "settings",
		icon: "settings",
		get description() {
			return t("slash.settings.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showSettingsSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "setup",
		aliases: ["providers"],
		icon: "gear",
		get description() {
			return t("slash.providers.description");
		},
		allowArgs: true,
		subcommands: [
			{
				name: "providers",
				get description() {
					return t("slash.providers.providers");
				},
			},
		],
		handleTui: async (command, runtime) => {
			const args = command.args.trim().toLowerCase();
			const opensProviders = args === "" || args === "providers";
			if (opensProviders) {
				await runtime.ctx.showProviderSetup();
			} else {
				runtime.ctx.showWarning(t("slash.providers.usage", { command: command.name }));
			}
			clearSubmittedText(runtime);
		},
	},
	{
		name: "plan",
		icon: "plan",
		get description() {
			return t("slash.plan.description");
		},
		inlineHint: "[prompt]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			if (!cfgPlanEnabled.get(runtime.ctx.settings)) return t("slash.plan.autocomplete.disabled");
			if (runtime.ctx.planModeEnabled) {
				const planFile = runtime.ctx.planModePlanFilePath;
				return planFile
					? t("slash.plan.autocomplete.onWithFile", { file: path.basename(planFile) })
					: t("slash.plan.autocomplete.on");
			}
			if (runtime.ctx.goalModeEnabled) return t("slash.plan.autocomplete.blockedByGoal");
			return t("slash.plan.autocomplete.off");
		},
		handleTui: async (command, runtime) => {
			await runWithDetachedModeDraft(command, runtime, () =>
				runtime.ctx.handlePlanModeCommand(command.args || undefined, runtime.input),
			);
		},
	},
	{
		name: "plan-review",
		icon: "plan",
		get description() {
			return t("slash.planReview.description");
		},
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.planModeEnabled
				? t("slash.planReview.autocomplete.available")
				: t("slash.planReview.autocomplete.inactive"),
		handleTui: async (_command, runtime) => {
			await runtime.ctx.openPlanReview();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "vibe",
		icon: "wave",
		get description() {
			return t("slash.vibe.description");
		},
		inlineHint: "[prompt]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			if (runtime.ctx.vibeModeEnabled) return t("slash.vibe.autocomplete.on");
			if (runtime.ctx.planModeEnabled) return t("slash.vibe.autocomplete.blockedByPlan");
			if (runtime.ctx.goalModeEnabled) return t("slash.vibe.autocomplete.blockedByGoal");
			return t("slash.vibe.autocomplete.off");
		},
		handleTui: async (command, runtime) => {
			await runWithDetachedModeDraft(command, runtime, () =>
				runtime.ctx.handleVibeModeCommand(command.args || undefined, runtime.input),
			);
		},
	},
	{
		name: "goal",
		icon: "goal",
		get description() {
			return t("slash.goal.description");
		},
		subcommands: [
			{
				name: "set",
				get description() {
					return t("slash.goal.sub.set.description");
				},
				usage: "<objective>",
			},
			{
				name: "show",
				get description() {
					return t("slash.goal.sub.show.description");
				},
			},
			{
				name: "pause",
				get description() {
					return t("slash.goal.sub.pause.description");
				},
			},
			{
				name: "resume",
				get description() {
					return t("slash.goal.sub.resume.description");
				},
			},
			{
				name: "drop",
				get description() {
					return t("slash.goal.sub.drop.description");
				},
			},
			{
				name: "budget",
				get description() {
					return t("slash.goal.sub.budget.description");
				},
				usage: "<N|off>",
			},
		],
		inlineHint: "[objective]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			if (!cfgGoalEnabled.get(runtime.ctx.settings)) return t("slash.goal.autocomplete.disabled");
			if (runtime.ctx.planModeEnabled) return t("slash.goal.autocomplete.blockedByPlan");
			const state = runtime.ctx.session.getGoalModeState();
			return state
				? t("slash.goal.autocomplete.active", {
						status: state.goal.status,
						objective: shortDetail(state.goal.objective),
					})
				: t("slash.goal.autocomplete.off");
		},
		handleTui: async (command, runtime) => {
			await runWithDetachedModeDraft(command, runtime, () =>
				runtime.ctx.handleGoalModeCommand(command.args || undefined, runtime.input),
			);
		},
	},
	{
		name: "guided-goal",
		icon: "compass",
		get description() {
			return t("slash.guidedGoal.description");
		},
		inlineHint: "[rough objective]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			await runWithDetachedModeDraft(command, runtime, () =>
				runtime.ctx.handleGuidedGoalCommand(command.args || undefined, runtime.input),
			);
		},
	},
	{
		name: "loop",
		icon: "loop",
		get description() {
			return t("slash.loop.description", { escape: formatKeyHint("escape") });
		},
		inlineHint: "[count|duration] [--while|--until '<cmd>'] [prompt]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			if (!runtime.ctx.loopModeEnabled) return t("slash.loop.autocomplete.off");
			if (runtime.ctx.loopModePaused) return t("slash.loop.autocomplete.paused");
			const bounds = [
				runtime.ctx.loopLimit ? describeLoopLimitRuntime(runtime.ctx.loopLimit) : undefined,
				runtime.ctx.loopCondition ? describeLoopCondition(runtime.ctx.loopCondition) : undefined,
			].filter((part): part is string => part !== undefined);
			if (bounds.length > 0) return t("slash.loop.autocomplete.onBounds", { bounds: bounds.join(", ") });
			if (runtime.ctx.loopPrompt) return t("slash.loop.autocomplete.onRepeating");
			return t("slash.loop.autocomplete.onWaiting");
		},
		handleTui: async (command, runtime) => {
			const prompt = await runtime.ctx.handleLoopCommand(command.args);
			clearSubmittedText(runtime);
			// Surface any inline prompt so the dispatcher returns it and the normal
			// submit flow runs the first loop iteration (recording it as the loop prompt).
			if (prompt) return { prompt };
		},
	},
	{
		name: "queue",
		icon: "inbox",
		get description() {
			return t("slash.queue.description");
		},
		inlineHint: "<message>",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			await runtime.ctx.handleQueueCommand(
				command.args,
				runtime.draftDetached ? { ...runtime.input, text: command.text } : undefined,
			);
		},
	},
	{
		name: "model",
		aliases: ["models"],
		icon: "model",
		get description() {
			return t("slash.model.description");
		},
		get acpDescription() {
			return t("slash.model.acpDescription");
		},
		getTuiAutocompleteDescription: runtime => {
			const model = runtime.ctx.session.model;
			return model
				? t("slash.model.autocomplete.selected", { provider: model.provider, id: model.id })
				: t("slash.model.autocomplete.none");
		},
		handle: async (command, runtime) => {
			if (command.args) {
				const selector = command.args.trim();
				const resolved = resolveSessionModelSelector(selector, runtime.session, runtime.settings);
				const match = resolved.model;
				if (!match) {
					return usage(t("slash.model.unknownModel", { selector }), runtime);
				}
				try {
					await runtime.session.setModel(match);
					if (resolved.thinkingLevel !== undefined) runtime.session.setThinkingLevel(resolved.thinkingLevel);
					await runtime.output(t("slash.model.set", { provider: match.provider, id: match.id }));
					await runtime.notifyTitleChanged?.();
					await runtime.notifyConfigChanged?.();
					return commandConsumed();
				} catch (err) {
					return usage(t("slash.model.setFailed", { reason: errorMessage(err) }), runtime);
				}
			}

			const model = runtime.session.model;
			await runtime.output(
				model
					? t("slash.model.current", { provider: model.provider, id: model.id })
					: t("slash.model.noneSelected"),
			);
			return commandConsumed();
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showModelSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "switch",
		icon: "swap",
		get description() {
			return t("slash.switch.description", { key: formatKeyHint("alt+p") });
		},
		get acpDescription() {
			return t("slash.switch.acpDescription");
		},
		acpInputHint: "[model]",
		inlineHint: "[model]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const model = runtime.ctx.session.model;
			return model
				? t("slash.model.autocomplete.selected", { provider: model.provider, id: model.id })
				: t("slash.model.autocomplete.none");
		},
		handle: async (command, runtime) => {
			const selector = command.args.trim();
			if (!selector) {
				const model = runtime.session.model;
				await runtime.output(
					model
						? t("slash.model.current", { provider: model.provider, id: model.id })
						: t("slash.model.noneSelected"),
				);
				return commandConsumed();
			}
			const resolved = resolveSessionModelSelector(selector, runtime.session, runtime.settings);
			if (!resolved.model) return usage(t("slash.switch.unknownModel", { selector }), runtime);
			try {
				await runtime.session.setModelTemporary(resolved.model, resolved.thinkingLevel);
				await runtime.output(t("slash.switch.sessionOnly", { model: formatModelString(resolved.model) }));
				await runtime.notifyTitleChanged?.();
				await runtime.notifyConfigChanged?.();
				return commandConsumed();
			} catch (err) {
				return usage(t("slash.switch.switchFailed", { reason: errorMessage(err) }), runtime);
			}
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const selector = command.args.trim();
			if (!selector) {
				runtime.ctx.showModelSelector({ temporaryOnly: true });
				return;
			}
			const resolved = resolveSessionModelSelector(selector, runtime.ctx.session, runtime.ctx.settings);
			if (!resolved.model) {
				runtime.ctx.showError(t("slash.switch.unknownModel", { selector }));
				return;
			}
			if (resolved.warning) runtime.ctx.showStatus(resolved.warning);
			await runtime.ctx.switchSessionModel(resolved.model, resolved.thinkingLevel);
		},
	},
	{
		name: "fast",
		icon: "fast",
		get description() {
			return t("slash.fast.description");
		},
		get acpDescription() {
			return t("slash.fast.acpDescription");
		},
		acpInputHint: "[on|ultra|off|status]",
		subcommands: [
			{
				name: "on",
				get description() {
					return t("slash.fast.on");
				},
			},
			{
				name: "ultra",
				get description() {
					return t("slash.fast.ultra");
				},
			},
			{
				name: "off",
				get description() {
					return t("slash.fast.off");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.fast.status");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			t("slash.fast.autocomplete", { status: formatFastModeStatus(runtime.ctx.session) }),
		handle: async (command, runtime) => {
			const message = runFastCommand(command.args.trim().toLowerCase(), runtime.session);
			if (message === undefined) return usage(t("slash.fast.usage"), runtime);
			await runtime.output(message);
			return commandConsumed();
		},
		handleTui: (command, runtime) => {
			const message = runFastCommand(command.args.trim().toLowerCase(), runtime.ctx.session);
			refreshStatusLine(runtime.ctx);
			runtime.ctx.showStatus(message ?? t("slash.fast.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "slow",
		icon: "fast",
		get description() {
			return t("slash.slow.description");
		},
		get acpDescription() {
			return t("slash.slow.acpDescription");
		},
		acpInputHint: "[on|off|status]",
		subcommands: [
			{
				name: "on",
				get description() {
					return t("slash.slow.sub.on.description");
				},
			},
			{
				name: "off",
				get description() {
					return t("slash.slow.sub.off.description");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.slow.sub.status.description");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.session.isSlowModeEnabled() ? t("slash.slow.autocomplete.on") : t("slash.slow.autocomplete.off"),
		handle: async (command, runtime) => {
			const message = runSlowCommand(command.args.trim().toLowerCase(), runtime.session);
			if (message === undefined) return usage(t("slash.slow.usage"), runtime);
			await runtime.output(message);
			return commandConsumed();
		},
		handleTui: (command, runtime) => {
			const message = runSlowCommand(command.args.trim().toLowerCase(), runtime.ctx.session);
			refreshStatusLine(runtime.ctx);
			runtime.ctx.showStatus(message ?? t("slash.slow.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "skillful",
		icon: "compass",
		get description() {
			return t("slash.skillful.description");
		},
		get acpDescription() {
			return t("slash.skillful.acpDescription");
		},
		acpInputHint: "[on|off|status]",
		subcommands: [
			{
				name: "on",
				get description() {
					return t("slash.skillful.sub.on.description");
				},
			},
			{
				name: "off",
				get description() {
					return t("slash.skillful.sub.off.description");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.skillful.sub.status.description");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			t("slash.skillful.autocomplete", {
				status: cfgSkillful.get(runtime.ctx.session.settings) ? t("common.state.on") : t("common.state.off"),
			}),
		handle: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (arg === "status") {
				await runtime.output(
					t("slash.skillful.status", {
						status: cfgSkillful.get(runtime.session.settings) ? t("common.state.on") : t("common.state.off"),
					}),
				);
				return commandConsumed();
			}
			if (!arg || arg === "toggle" || arg === "on" || arg === "off") {
				const enabled =
					arg === "on"
						? await runtime.session.setSkillful(true)
						: arg === "off"
							? await runtime.session.setSkillful(false)
							: await runtime.session.toggleSkillful();
				await runtime.output(
					t("slash.skillful.toggled", {
						state: enabled ? t("common.state.enabled") : t("common.state.disabled"),
					}),
				);
				return commandConsumed();
			}
			return usage(t("slash.skillful.usage"), runtime);
		},
		handleTui: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (arg === "status") {
				runtime.ctx.showStatus(
					t("slash.skillful.statusTui", {
						status: cfgSkillful.get(runtime.ctx.session.settings) ? t("common.state.on") : t("common.state.off"),
					}),
				);
				clearSubmittedText(runtime);
				return;
			}
			if (!arg || arg === "toggle" || arg === "on" || arg === "off") {
				const enabled =
					arg === "on"
						? await runtime.ctx.session.setSkillful(true)
						: arg === "off"
							? await runtime.ctx.session.setSkillful(false)
							: await runtime.ctx.session.toggleSkillful();
				runtime.ctx.showStatus(
					t("slash.skillful.toggled", {
						state: enabled ? t("common.state.enabled") : t("common.state.disabled"),
					}),
				);
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus(t("slash.skillful.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "extended-context",
		icon: "expand",
		get description() {
			return t("slash.extendedContext.description");
		},
		get acpDescription() {
			return t("slash.extendedContext.acpDescription");
		},
		acpInputHint: "[on|off|status]",
		subcommands: [
			{
				name: "on",
				get description() {
					return t("slash.extendedContext.sub.on.description");
				},
			},
			{
				name: "off",
				get description() {
					return t("slash.extendedContext.sub.off.description");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.extendedContext.sub.status.description");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			t("slash.extendedContext.autocomplete", { status: formatExtendedContextStatus(runtime.ctx.settings) }),
		handle: async (command, runtime) => {
			const output = applyExtendedContextCommand(runtime.settings, command.args);
			if (!output) return usage(t("slash.extendedContext.usage"), runtime);
			await runtime.output(output);
			return commandConsumed();
		},
		handleTui: (command, runtime) => {
			const output = applyExtendedContextCommand(runtime.ctx.settings, command.args);
			refreshStatusLine(runtime.ctx);
			runtime.ctx.showStatus(output ?? t("slash.extendedContext.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "computer",
		icon: "computer",
		get description() {
			return t("slash.computer.description");
		},
		get acpDescription() {
			return t("slash.computer.acpDescription");
		},
		acpInputHint: "[on|off|status]",
		subcommands: [
			{
				name: "on",
				get description() {
					return t("slash.computer.on");
				},
			},
			{
				name: "off",
				get description() {
					return t("slash.computer.off");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.computer.status");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			t("slash.computer.autocomplete", {
				status: cfgComputerEnabled.get(runtime.ctx.session.settings) ? t("common.state.on") : t("common.state.off"),
			}),
		handle: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (arg === "status") {
				await runtime.output(formatComputerUseStatus(runtime.session));
				return commandConsumed();
			}
			if (!arg || arg === "toggle" || arg === "on" || arg === "off") {
				const enable = arg === "off" ? false : arg === "on" || !cfgComputerEnabled.get(runtime.session.settings);
				await runtime.output(applyComputerUseToggle(runtime.session, enable));
				return commandConsumed();
			}
			return usage(t("slash.computer.usage"), runtime);
		},
		handleTui: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (arg === "status") {
				runtime.ctx.showStatus(formatComputerUseStatus(runtime.ctx.session));
				clearSubmittedText(runtime);
				return;
			}
			if (!arg || arg === "toggle" || arg === "on" || arg === "off") {
				const enable =
					arg === "off" ? false : arg === "on" || !cfgComputerEnabled.get(runtime.ctx.session.settings);
				runtime.ctx.showStatus(applyComputerUseToggle(runtime.ctx.session, enable));
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus(t("slash.computer.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "prewalk",
		icon: "prewalk",
		get description() {
			return t("slash.prewalk.description");
		},
		allowArgs: true,
		get acpDescription() {
			return t("slash.prewalk.acpDescription");
		},
		acpInputHint: "[restart]",
		subcommands: [
			{
				name: "restart",
				get description() {
					return t("slash.prewalk.sub.restart.description");
				},
			},
		],
		handle: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (arg && arg !== "restart") return usage(t("slash.prewalk.usage"), runtime);
			const target = resolveSessionModelSelector("@smol", runtime.session, runtime.settings);
			if (target.error || !target.model) {
				return usage(target.error ?? t("slash.prewalk.smolNotFound"), runtime);
			}
			if (!runtime.session.modelRegistry.hasConfiguredAuth(target.model)) {
				return usage(
					t("slash.prewalk.noApiKey", { provider: target.model.provider, id: target.model.id }),
					runtime,
				);
			}
			if (arg === "restart") {
				const source = resolveSessionModelSelector("@default", runtime.session, runtime.settings);
				if (source.error || !source.model) {
					return usage(source.error ?? t("slash.prewalk.defaultNotFound"), runtime);
				}
				if (!runtime.session.modelRegistry.hasConfiguredAuth(source.model)) {
					return usage(
						t("slash.prewalk.noApiKey", { provider: source.model.provider, id: source.model.id }),
						runtime,
					);
				}
				const result = await runtime.session.restartPrewalk(
					source.model,
					source.thinkingLevel,
					target.model,
					target.thinkingLevel,
				);
				if (result === "rejected") return commandConsumed();
				const restartSource = `${source.model.provider}/${source.model.id}`;
				await runtime.output(
					result === "armed"
						? t("slash.prewalk.restarted", {
								source: restartSource,
								target: `${target.model.provider}/${target.model.id}`,
							})
						: t("slash.prewalk.reset", { source: restartSource }),
				);
				return commandConsumed();
			}
			const armed = runtime.session.armPrewalk(target.model, target.thinkingLevel);
			if (armed) {
				await runtime.output(t("slash.prewalk.on", { target: `${target.model.provider}/${target.model.id}` }));
			}
			return commandConsumed();
		},
	},
];
