import { clearSubmittedText } from "./helpers/draft";
import { Spacer } from "@oh-my-pi/pi-tui";
import { APP_NAME, formatAge } from "@oh-my-pi/pi-utils";
import { formatKeyHint } from "@oh-my-pi/pi-tui/app-keybindings";
import { CollabGuestLink } from "../collab/guest";
import type { CollabHost } from "../collab/host";
import { type CollabHostSnapshot, listCollabHosts } from "../collab/registry";
import { settings } from "../config/settings";
import { parseExportArgs } from "../export/html/args";
import { shareSession } from "../export/share";
import { theme } from "@oh-my-pi/pi-tui/theme";
import type { InteractiveModeContext } from "../modes/types";
import { sanitizeDisplayLine } from "@oh-my-pi/pi-tui/overlays/extensions/display-text";
import { extractLastCodeBlock, extractLastCommand, extractLastLink } from "@oh-my-pi/pi-tui/overlays/copy-targets";
import { restartBrowserForModeChange } from "../tools/browser";
import { shortenPath, TRUNCATE_LENGTHS, truncateToWidth } from "@oh-my-pi/pi-tui/render/render-utils";
import { openPath } from "../utils/open";
import { copyToClipboard } from "../utils/clipboard";
import { refreshStatusLine } from "./builtin-modes";
import { CollabQrCodeComponent, collabBrowserLink } from "@oh-my-pi/pi-tui/chrome/collab-qrcode";
import { commandConsumed, errorMessage, parseSubcommand, usage } from "./helpers/parse";
import { t } from "@oh-my-pi/pi-i18n";
import type { SlashCommandSpec } from "./types";

import { cfgBrowserEnabled, cfgBrowserHeadless } from "../tools/browser/settings";
import { cfgShareRedactSecrets, cfgShareServerUrl, cfgShareStore } from "../commands/settings";

/** Join hint printed by /collab: compact terminal link + clickable browser deep link. */
function collabLinkHint(host: CollabHost, heading: string, view = false): string {
	const bullet = theme.fg("accent", theme.format.bullet);
	const link = view ? host.viewLink : host.link;
	const webLink = view ? host.webViewLink : host.webLink;
	return [
		// Keep the URL on the first row: under transcript pressure the status
		// block is clipped to rendered[0], which used to drop the join link.
		`${collabBrowserLink(webLink, t("slash.collab.link.joinInBrowser"))}  ${theme.fg("success", heading)}`,
		` ${bullet} ${theme.fg("muted", view ? t("slash.collab.link.watchTerminal") : t("slash.collab.link.joinTerminal"))} ${APP_NAME} join "${link}"`,
		` ${bullet} ${theme.fg("muted", t("slash.collab.link.anyBrowser"))} ${collabBrowserLink(webLink)}`,
		theme.fg("dim", view ? t("slash.collab.link.viewNotice") : t("slash.collab.link.controlNotice")),
	].join("\n");
}

function showCollabQrCode(ctx: InteractiveModeContext, webLink: string): void {
	try {
		ctx.present([new Spacer(1), new CollabQrCodeComponent(webLink)]);
	} catch (err) {
		ctx.showError(t("slash.collab.qrFailed", { error: errorMessage(err) }));
	}
}

function showCollabLink(ctx: InteractiveModeContext, host: CollabHost, heading: string, view = false): void {
	ctx.showStatus(collabLinkHint(host, heading, view), { dim: false });
	showCollabQrCode(ctx, view ? host.webViewLink : host.webLink);
}

export const BUILTIN_COLLABORATION_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "advisor",
		icon: "advisor",
		get description() {
			return t("slash.advisor.description");
		},
		get acpDescription() {
			return t("slash.advisor.acpDescription");
		},
		acpInputHint: "[on|off|status|dump [raw]|configure]",
		subcommands: [
			{
				name: "on",
				get description() {
					return t("slash.advisor.on");
				},
			},
			{
				name: "off",
				get description() {
					return t("slash.advisor.off");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.advisor.status");
				},
			},
			{
				name: "dump",
				get description() {
					return t("slash.advisor.dump");
				},
				usage: "[raw]",
			},
			{
				name: "configure",
				get description() {
					return t("slash.advisor.configure");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const stats = runtime.ctx.session.getAdvisorStats();
			if (stats.active && stats.advisors.length > 1)
				return t("slash.advisor.autocomplete.multi", { count: stats.advisors.length });
			if (stats.active && stats.model)
				return t("slash.advisor.autocomplete.model", { provider: stats.model.provider, id: stats.model.id });
			if (stats.configured) return t("slash.advisor.autocomplete.configured");
			return t("slash.advisor.autocomplete.off");
		},
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || verb === "toggle") {
				const active = runtime.session.toggleAdvisorEnabled();
				const configured = runtime.session.isAdvisorEnabled();
				if (active) {
					await runtime.output(t("slash.advisor.enabled"));
				} else if (configured) {
					await runtime.output(t("slash.advisor.enabledNoModel"));
				} else {
					await runtime.output(t("slash.advisor.disabled"));
				}
				return commandConsumed();
			}
			if (verb === "on") {
				const active = runtime.session.setAdvisorEnabled(true);
				await runtime.output(active ? t("slash.advisor.enabled") : t("slash.advisor.enabledNoModel"));
				return commandConsumed();
			}
			if (verb === "off") {
				runtime.session.setAdvisorEnabled(false);
				await runtime.output(t("slash.advisor.disabled"));
				return commandConsumed();
			}
			if (verb === "status") {
				await runtime.output(runtime.session.formatAdvisorStatus());
				return commandConsumed();
			}
			if (verb === "dump") {
				const isRaw = rest.toLowerCase() === "raw";
				const text = runtime.session.formatAdvisorHistoryAsText({ compact: !isRaw });
				await runtime.output(text ?? t("slash.advisor.notActive"));
				return commandConsumed();
			}
			if (verb === "configure") {
				await runtime.output(t("slash.advisor.configureTuiOnly"));
				return commandConsumed();
			}
			return usage(t("slash.advisor.usage"), runtime);
		},
		handleTui: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || verb === "toggle") {
				const active = runtime.ctx.session.toggleAdvisorEnabled();
				const configured = runtime.ctx.session.isAdvisorEnabled();
				if (active) {
					runtime.ctx.showStatus(t("slash.advisor.enabled"));
				} else if (configured) {
					runtime.ctx.showStatus(t("slash.advisor.enabledNoModel"));
				} else {
					runtime.ctx.showStatus(t("slash.advisor.disabled"));
				}
				refreshStatusLine(runtime.ctx);
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "on") {
				const active = runtime.ctx.session.setAdvisorEnabled(true);
				runtime.ctx.showStatus(active ? t("slash.advisor.enabled") : t("slash.advisor.enabledNoModel"));
				refreshStatusLine(runtime.ctx);
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "off") {
				runtime.ctx.session.setAdvisorEnabled(false);
				runtime.ctx.showStatus(t("slash.advisor.disabled"));
				refreshStatusLine(runtime.ctx);
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "status") {
				await runtime.ctx.handleAdvisorStatusCommand();
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "dump") {
				const isRaw = rest.toLowerCase() === "raw";
				runtime.ctx.handleAdvisorDumpCommand(isRaw);
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "configure") {
				runtime.ctx.showAdvisorConfigure();
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus(t("slash.advisor.usage"));
			clearSubmittedText(runtime);
		},
	},
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
		name: "collab",
		icon: "broadcast",
		get description() {
			return t("slash.collab.description");
		},
		inlineHint: "[start|view|list|stop|status] [relayUrl]",
		subcommands: [
			{
				name: "view",
				get description() {
					return t("slash.collab.sub.view.description");
				},
			},
			{
				name: "list",
				get description() {
					return t("slash.collab.sub.list.description");
				},
			},
			{
				name: "status",
				get description() {
					return t("slash.collab.sub.status.description");
				},
			},
			{
				name: "stop",
				get description() {
					return t("slash.collab.sub.stop.description");
				},
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const host = runtime.ctx.collabController.host;
			if (host) {
				return t("slash.collab.autocomplete.hosting", { count: Math.max(0, host.participants.length - 1) });
			}
			if (runtime.ctx.collabGuest?.readOnly) return t("slash.collab.autocomplete.readOnlyGuest");
			if (runtime.ctx.collabGuest) return t("slash.collab.autocomplete.guest");
			return t("slash.collab.autocomplete.off");
		},
		handleTui: async (command, runtime) => {
			const ctx = runtime.ctx;
			clearSubmittedText(runtime);
			const args = command.args.trim();
			const { verb, rest } = parseSubcommand(args);
			if (verb === "stop") {
				await ctx.collabController.stop("host stopped");
				ctx.showStatus(t("slash.collab.stopped"));
				return;
			}
			if (verb === "status") {
				const host = ctx.collabController.host;
				if (host) {
					const names = host.participants.map(p =>
						p.role === "host"
							? t("slash.collab.participant.hostName", { name: p.name })
							: p.readOnly
								? t("slash.collab.participant.viewOnlyName", { name: p.name })
								: p.name,
					);
					const link = host.access === "view" ? host.webViewLink : host.webLink;
					ctx.showStatus(t("slash.collab.statusHost", { names: names.join(", "), link: collabBrowserLink(link) }));
				} else if (ctx.collabGuest) {
					ctx.showStatus(
						ctx.collabGuest.readOnly ? t("slash.collab.statusReadOnlyGuest") : t("slash.collab.statusGuest"),
					);
				} else {
					ctx.showStatus(t("slash.collab.statusNone"));
				}
				return;
			}
			if (verb === "list") {
				// Same registry as `omp collab list`: metadata only, never a link. A
				// link is a deliberate per-host act (`omp collab link <id> [--view]`),
				// so a listing can be shown or logged without granting anything.
				if (rest.trim()) {
					ctx.showError(t("slash.collab.listUsage", { app: APP_NAME }));
					return;
				}
				let hosts: CollabHostSnapshot[];
				try {
					hosts = await listCollabHosts();
				} catch (err) {
					ctx.showError(
						truncateToWidth(
							sanitizeDisplayLine(t("slash.collab.listFailed", { error: errorMessage(err) })),
							TRUNCATE_LENGTHS.LINE,
						),
					);
					return;
				}
				if (hosts.length === 0) {
					ctx.showStatus(t("slash.collab.noHosts"));
					return;
				}
				const bullet = theme.fg("accent", theme.format.bullet);
				const plural = hosts.length === 1 ? "" : "s";
				const lines = [theme.fg("success", t("slash.collab.hostsCount", { count: hosts.length, plural }))];
				for (const host of hosts) {
					// Registry strings come from other processes: strip controls,
					// collapse newlines, and bound the width before they hit the TUI.
					const name = host.sessionName ? sanitizeDisplayLine(host.sessionName) : "";
					const sessionId = sanitizeDisplayLine(host.sessionId);
					const session = truncateToWidth(name ? `${name} (${sessionId})` : sessionId, TRUNCATE_LENGTHS.LONG);
					const guests = host.participants - 1;
					const room = [
						t("slash.collab.room.gen", { generation: host.generation }),
						host.model
							? sanitizeDisplayLine(`${host.model.provider}/${host.model.id}`)
							: t("slash.collab.room.noModel"),
						t("slash.collab.room.started", {
							age: formatAge(Math.round((Date.now() - host.startedAt) / 1000)) || t("slash.collab.room.justNow"),
						}),
					].join(", ");
					const detail = [
						t("slash.collab.room.pid", { pid: host.pid }),
						t("slash.collab.room.guests", { count: guests, plural: guests === 1 ? "" : "s" }),
						host.access,
						host.relayConnected
							? t("slash.collab.room.relayConnected")
							: t("slash.collab.room.relayReconnecting"),
						...(host.inputRequired ? [t("slash.collab.room.inputRequired")] : []),
						...(host.busy === null
							? []
							: [host.busy ? t("slash.collab.room.working") : t("slash.collab.room.idle")]),
						truncateToWidth(sanitizeDisplayLine(shortenPath(host.cwd)), TRUNCATE_LENGTHS.TITLE),
					].join(", ");
					lines.push(
						// Fields are bounded above; each composed row is bounded too so the
						// fixed details can never push it past one transcript line.
						truncateToWidth(` ${bullet} ${session} ${theme.fg("muted", `— ${room}`)}`, TRUNCATE_LENGTHS.LINE),
						truncateToWidth(`   ${theme.fg("muted", detail)}`, TRUNCATE_LENGTHS.LINE),
						`   ${theme.fg("dim", `${APP_NAME} collab link ${host.instanceId}${host.access === "view" ? " --view" : ""}`)}`,
					);
				}
				ctx.showStatus(lines.join("\n"), { dim: false });
				return;
			}
			if (ctx.collabGuest) {
				ctx.showError(t("slash.collab.alreadyGuest"));
				return;
			}
			const knownStartVerb = verb === "start" || verb === "view";
			const view = verb === "view";
			const access = view ? "view" : "control";
			const existing = ctx.collabController.host;
			let host: CollabHost;
			try {
				host = await ctx.collabController.start({ access, relay: knownStartVerb ? rest : args });
			} catch (err) {
				ctx.showError(t("slash.collab.startFailed", { error: errorMessage(err) }));
				return;
			}
			let heading = existing ? t("slash.collab.heading.restartedControl") : t("slash.collab.heading.started");
			if (host === existing)
				heading = view ? t("slash.collab.heading.readOnlyActive") : t("slash.collab.heading.active");
			showCollabLink(ctx, host, heading, view);
		},
	},
	{
		name: "join",
		icon: "signIn",
		get description() {
			return t("slash.join.description");
		},
		inlineHint: "<link>",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const ctx = runtime.ctx;
			clearSubmittedText(runtime);
			const link = command.args.trim();
			if (!link) {
				ctx.showError(t("slash.join.usage"));
				return;
			}
			if (ctx.collabGuest) {
				ctx.showError(t("slash.join.alreadyIn"));
				return;
			}
			try {
				// Stop stale/ending ownership and cancel pending starts, not a live room.
				if (!ctx.collabController.host) await ctx.collabController.stop("joining another session");
				// Recheck after teardown: a concurrent manual start may have won.
				if (ctx.collabController.host) {
					ctx.showError(t("slash.join.stopHostingFirst"));
					return;
				}
				await new CollabGuestLink(ctx).join(link);
			} catch (err) {
				ctx.showError(t("slash.join.failed", { error: errorMessage(err) }));
			}
		},
	},
	{
		name: "leave",
		icon: "signOut",
		get description() {
			return t("slash.leave.description");
		},
		getTuiAutocompleteDescription: runtime => {
			if (runtime.ctx.collabController.host) return t("slash.leave.autocomplete.hosting");
			if (runtime.ctx.collabGuest) return t("slash.leave.autocomplete.guest");
			return t("slash.leave.autocomplete.none");
		},
		handleTui: async (_command, runtime) => {
			const ctx = runtime.ctx;
			clearSubmittedText(runtime);
			if (ctx.collabGuest) {
				await ctx.collabGuest.leave("left");
				return;
			}
			const wasHosting = ctx.collabHost !== undefined;
			await ctx.collabController.stop("host stopped");
			if (wasHosting) {
				ctx.showStatus(t("slash.collab.stopped"));
				return;
			}
			ctx.showStatus(t("slash.collab.statusNone"));
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
