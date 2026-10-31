import { clearSubmittedText } from "./helpers/draft";
import { formatKeyHint } from "@oh-my-pi/pi-tui/app-keybindings";
import { settings } from "../config/settings";
import { parseExportArgs } from "../export/html/args";
import { shareSession } from "../export/share";
import { extractLastCodeBlock, extractLastCommand, extractLastLink } from "@oh-my-pi/pi-tui/overlays/copy-targets";
import { restartBrowserForModeChange } from "../tools/browser";
import { openPath } from "../utils/open";
import { copyToClipboard } from "../utils/clipboard";
import { commandConsumed, errorMessage, usage } from "./helpers/parse";
import { t } from "@oh-my-pi/pi-i18n";
import type { SlashCommandSpec } from "./types";

import { cfgBrowserEnabled, cfgBrowserHeadless } from "../tools/browser/settings";
import { cfgShareRedactSecrets, cfgShareServerUrl, cfgShareStore } from "../commands/settings";

export const BUILTIN_UTILITY_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "export",
		icon: "export",
		get description() {
			return t("slash.export.description");
		},
		inlineHint: "[--themes] [path]",
		allowArgs: true,
		handle: async (command, runtime) => {
			try {
				const { outputPath, useUserThemes } = parseExportArgs(command.args);
				if (outputPath === "--copy" || outputPath === "clipboard" || outputPath === "copy") {
					return usage(t("slash.export.useDump"), runtime);
				}
				const filePath = await runtime.session.exportToHtml(outputPath, useUserThemes);
				await runtime.output(t("slash.export.exported", { path: filePath }));
				return commandConsumed();
			} catch (err) {
				return usage(t("slash.export.failed", { error: errorMessage(err) }), runtime);
			}
		},
		handleTui: async (command, runtime) => {
			await runtime.ctx.handleExportCommand(command.text);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "trace",
		icon: "stats",
		get description() {
			return t("slash.trace.description");
		},
		handle: async (_command, runtime) => {
			const sessionFile = runtime.session.sessionFile;
			if (!sessionFile) {
				await runtime.output(t("slash.trace.noSession"));
				return commandConsumed();
			}
			try {
				// Lazy: the stats dashboard (server + sqlite) loads on demand only,
				// matching src/cli/stats-cli.ts, to keep CLI startup fast.
				const { formatStatsDashboardUrl, startServer } = await import("@oh-my-pi/omp-stats");
				const { hostname, port } = await startServer();
				const url = `${formatStatsDashboardUrl(hostname, port)}/#/traces?s=${encodeURIComponent(sessionFile)}`;
				await runtime.output(url);
				return commandConsumed();
			} catch (err) {
				return usage(t("slash.trace.failed", { error: errorMessage(err) }), runtime);
			}
		},
		handleTui: async (_command, runtime) => {
			await runtime.ctx.handleTraceCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "dump",
		icon: "clipboard",
		get description() {
			return t("slash.dump.description");
		},
		get acpDescription() {
			return t("slash.dump.acpDescription");
		},
		allowArgs: true,
		handle: async (_command, runtime) => {
			const text = runtime.session.formatSessionAsText();
			if (!text) {
				await runtime.output(t("slash.dump.noMessages"));
				return commandConsumed();
			}
			let sidecarPath: string | undefined;
			try {
				sidecarPath = await runtime.session.dumpLlmRequestToTmpDir();
			} catch {
				// Sidecar is best-effort; the transcript is still output below.
			}
			const lines = [text];
			if (sidecarPath)
				lines.push("", t("slash.dump.llmJson", { path: sidecarPath }), t("slash.dump.llmJsonWarning"));
			await runtime.output(lines.join("\n"));
			return commandConsumed();
		},
		handleTui: async (_command, runtime) => {
			await runtime.ctx.handleDumpCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "share",
		icon: "share",
		get description() {
			return t("slash.share.description");
		},
		handle: async (_command, runtime) => {
			try {
				const result = await shareSession(runtime.sessionManager, {
					serverUrl: cfgShareServerUrl.get(runtime.settings),
					store: cfgShareStore.get(runtime.settings),
					state: runtime.session.state,
					obfuscator: cfgShareRedactSecrets.get(runtime.settings) ? runtime.session.obfuscator : undefined,
				});
				const lines = [t("slash.share.url", { url: result.url })];
				if (result.gistUrl) lines.push(t("slash.share.gist", { url: result.gistUrl }));
				if (result.truncated) lines.push(t("slash.share.truncated"));
				await runtime.output(lines.join("\n"));
				return commandConsumed();
			} catch (err) {
				return usage(t("slash.share.failed", { error: errorMessage(err) }), runtime);
			}
		},
		handleTui: async (_command, runtime) => {
			await runtime.ctx.handleShareCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "browser",
		icon: "globe",
		get description() {
			return t("slash.browser.description");
		},
		acpInputHint: "[headless|visible]",
		subcommands: [
			{
				name: "headless",
				get description() {
					return t("slash.browser.sub.headless.description");
				},
			},
			{
				name: "visible",
				get description() {
					return t("slash.browser.sub.visible.description");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			if (!cfgBrowserEnabled.get(runtime.ctx.settings)) return t("slash.browser.autocomplete.disabled");
			return cfgBrowserHeadless.get(runtime.ctx.settings)
				? t("slash.browser.autocomplete.headless")
				: t("slash.browser.autocomplete.visible");
		},
		handle: async (command, runtime) => {
			const arg = command.args.toLowerCase();
			const enabled = cfgBrowserEnabled.get(runtime.settings);
			if (!enabled) return usage(t("slash.browser.disabledUsage"), runtime);
			const current = cfgBrowserHeadless.get(runtime.settings);
			let next = current;
			if (!arg) next = !current;
			else if (arg === "headless" || arg === "hidden") next = true;
			else if (arg === "visible" || arg === "show" || arg === "headful") next = false;
			else return usage(t("slash.browser.usage"), runtime);
			cfgBrowserHeadless.set(runtime.settings, next);
			const mode = next ? t("slash.browser.mode.headless") : t("slash.browser.mode.visible");
			try {
				await restartBrowserForModeChange();
			} catch (err) {
				// Setting was already mutated; surface the restart failure so the
				// user knows the browser is in an inconsistent state.
				await runtime.output(t("slash.browser.modeSetRestartFailed", { mode, error: errorMessage(err) }));
				return commandConsumed();
			}
			await runtime.output(t("slash.browser.mode", { mode }));
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			const arg = command.args.toLowerCase();
			const current = cfgBrowserHeadless.get(settings);
			let next = current;
			if (!cfgBrowserEnabled.get(settings)) {
				runtime.ctx.showWarning(t("slash.browser.disabled"));
				clearSubmittedText(runtime);
				return;
			}
			if (!arg) {
				next = !current;
			} else if (arg === "headless" || arg === "hidden") {
				next = true;
			} else if (arg === "visible" || arg === "show" || arg === "headful") {
				next = false;
			} else {
				runtime.ctx.showStatus(t("slash.browser.usage"));
				clearSubmittedText(runtime);
				return;
			}
			cfgBrowserHeadless.set(settings, next);
			const mode = next ? t("slash.browser.mode.headless") : t("slash.browser.mode.visible");
			try {
				await restartBrowserForModeChange();
			} catch (error) {
				runtime.ctx.showWarning(t("slash.browser.restartFailed", { error: errorMessage(error) }));
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus(t("slash.browser.mode", { mode }));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "copy",
		icon: "copy",
		get description() {
			return t("slash.copy.description");
		},
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (!arg) {
				runtime.ctx.showCopySelector();
				clearSubmittedText(runtime);
				return;
			}
			if (arg === "code") {
				const block = extractLastCodeBlock(runtime.ctx.session.messages);
				if (!block) {
					runtime.ctx.showStatus(t("slash.copy.noCodeBlock"));
					clearSubmittedText(runtime);
					return;
				}
				await copyToClipboard(block.code);
				runtime.ctx.showStatus(t("slash.copy.copiedCodeBlock"));
				clearSubmittedText(runtime);
				return;
			}
			if (arg === "cmd" || arg === "command") {
				const lastCommand = extractLastCommand(runtime.ctx.session.messages);
				if (!lastCommand) {
					runtime.ctx.showStatus(t("slash.copy.noCommand"));
					clearSubmittedText(runtime);
					return;
				}
				await copyToClipboard(lastCommand.code);
				runtime.ctx.showStatus(
					t("slash.copy.copiedCommand", {
						kind: lastCommand.kind === "bash" ? t("slash.copy.kind.bash") : t("slash.copy.kind.eval"),
					}),
				);
				clearSubmittedText(runtime);
				return;
			}
			if (arg === "link" || arg === "url") {
				const link = extractLastLink(runtime.ctx.session.messages);
				if (!link) {
					runtime.ctx.showStatus(t("slash.copy.noLink"));
					clearSubmittedText(runtime);
					return;
				}
				await copyToClipboard(link.href);
				runtime.ctx.showStatus(t("slash.copy.copiedLink"));
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus(t("slash.copy.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "open",
		icon: "globe",
		get description() {
			return t("slash.open.description");
		},
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const arg = command.args.trim().toLowerCase();
			if (arg && arg !== "link" && arg !== "url") {
				runtime.ctx.showStatus(t("slash.open.usage", { right: formatKeyHint("right"), open: formatKeyHint("o") }));
				clearSubmittedText(runtime);
				return;
			}
			const link = extractLastLink(runtime.ctx.session.messages);
			if (!link) {
				runtime.ctx.showStatus(t("slash.open.noLink"));
				clearSubmittedText(runtime);
				return;
			}
			openPath(link.href);
			runtime.ctx.showStatus(t("slash.open.opening", { href: link.href }));
			clearSubmittedText(runtime);
		},
	},
];
