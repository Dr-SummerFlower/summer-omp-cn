import { clearSubmittedText } from "./helpers/draft";
import { t } from "@oh-my-pi/pi-i18n";
import { getOAuthProviders } from "@oh-my-pi/pi-ai/oauth";
import { journalJudgmentUsage, resolveJudge, sharedJudgmentCache } from "../judgment";
import type { AgentSession } from "../session/agent-session";
import type { SessionOAuthAccountList } from "../session/agent-session-types";
import {
	getChangelogPath,
	parseChangelog,
	parseChangelogView,
	renderChangelogEntries,
	selectChangelogEntries,
} from "../utils/changelog";
import { formatTokenCount, refreshStatusLine } from "./builtin-modes";
import { buildContextReportText } from "./helpers/context-report";
import { formatCoarseDuration } from "@oh-my-pi/pi-tui/chrome/format";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { handleMcpAcp } from "./helpers/mcp";
import { commandConsumed, errorMessage, parseSubcommand, usage } from "./helpers/parse";
import { describeRedeemOutcome, toResetUsageAccounts } from "./helpers/reset-usage";
import type { ResetUsageAccount } from "@oh-my-pi/pi-tui/overlays/reset-usage-selector";
import { matchSessionPinAccounts, toSessionPinAccounts } from "./helpers/session-pin";
import {
	launchStatsDashboard,
	parseStatsDashboardArgs,
	type StatsDashboardArgs,
	type StatsDashboardLaunchResult,
} from "./helpers/stats-dashboard";
import { StatsNotice } from "@oh-my-pi/pi-tui/overlays/stats-notice";
import { handleTodoAcp } from "./helpers/todo";
import { buildUsageReportText } from "./helpers/usage-report";
import type { SlashCommandRuntime, SlashCommandSpec } from "./types";

function normalizeResetProvider(value: string): string | undefined {
	switch (value.trim().toLowerCase()) {
		case "anthropic":
		case "claude":
			return "anthropic";
		case "openai-codex":
		case "codex":
			return "openai-codex";
		default:
			return undefined;
	}
}

async function handleUsageResetCommand(
	arg: string,
	session: AgentSession,
	output: SlashCommandRuntime["output"],
): Promise<void> {
	const safe = (value: string): string => sanitizeText(value.replace(/[\r\n\t]+/g, " "));
	let accounts: ResetUsageAccount[];
	try {
		accounts = toResetUsageAccounts(await session.listResetCredits());
	} catch (error) {
		await output(t("slash.usage.reset.loadFailed", { reason: safe(errorMessage(error)) }));
		return;
	}
	if (accounts.length === 0) {
		await output(t("slash.usage.reset.noAccounts"));
		return;
	}
	const targetArg = arg.trim();
	if (!targetArg) {
		const lines = [t("slash.usage.reset.title")];
		for (const account of accounts) {
			let detail: string;
			if (account.error) {
				detail = t("slash.usage.reset.unavailable", { reason: safe(account.error) });
			} else {
				detail = t("slash.usage.reset.counts", {
					available: account.availableCount,
					redeemable: account.redeemableCount,
				});
				if (account.expiresAt) detail += t("slash.usage.reset.expires", { when: safe(account.expiresAt) });
				if (account.redeemableCount === 0 && account.unavailableReason) {
					detail += t("slash.usage.reset.reason", { reason: safe(account.unavailableReason) });
				}
			}
			lines.push(
				t("slash.usage.reset.accountLine", {
					label: safe(account.label),
					providerLabel: safe(account.providerLabel),
					provider: account.provider,
					credentialId: account.target.credentialId,
					detail,
					active: account.active ? t("slash.common.activeSuffix") : "",
				}),
			);
		}
		lines.push("", t("slash.usage.reset.spendHint"));
		await output(lines.join("\n"));
		return;
	}

	const slash = targetArg.indexOf("/");
	if (slash <= 0) {
		await output(t("slash.usage.reset.chooseHint"));
		return;
	}
	const requestedProvider = normalizeResetProvider(targetArg.slice(0, slash));
	const requestedAccount = targetArg
		.slice(slash + 1)
		.trim()
		.toLowerCase();
	if (!requestedProvider) {
		await output(t("slash.usage.reset.unknownProvider", { provider: safe(targetArg.slice(0, slash)) }));
		return;
	}
	const requestedCredentialId = /^\d+$/.test(requestedAccount) ? Number(requestedAccount) : undefined;
	const target = accounts.find(account => {
		if (account.provider !== requestedProvider) return false;
		if (requestedAccount === "active") return account.active;
		return requestedCredentialId !== undefined && account.target.credentialId === requestedCredentialId;
	});
	if (!target) {
		await output(t("slash.usage.reset.noMatch", { target: safe(targetArg) }));
		return;
	}
	if (target.redeemableCount <= 0) {
		const reason = target.unavailableReason
			? t("slash.usage.reset.reason", { reason: safe(target.unavailableReason) })
			: "";
		await output(
			t("slash.usage.reset.noneUsable", {
				label: safe(target.label),
				providerLabel: safe(target.providerLabel),
				reason,
			}),
		);
		return;
	}
	const outcome = await session.redeemResetCredit(target.target);
	await output(safe(describeRedeemOutcome(outcome, target.label)));
}

async function handleSessionPinCommand(
	arg: string,
	session: AgentSession,
	output: SlashCommandRuntime["output"],
): Promise<void> {
	if (session.isStreaming) {
		await output(t("slash.session.pin.streaming"));
		return;
	}
	let accountList: SessionOAuthAccountList | undefined;
	try {
		accountList = await session.listCurrentProviderOAuthAccounts();
	} catch (error) {
		await output(t("slash.session.pin.loadFailed", { reason: errorMessage(error) }));
		return;
	}
	if (!accountList) {
		await output(t("slash.session.pin.selectModel"));
		return;
	}
	const provider = getOAuthProviders().find(candidate => candidate.id === accountList.provider);
	const providerName = provider?.name ?? accountList.provider;
	const accounts = toSessionPinAccounts(accountList.accounts);
	if (accounts.length === 0) {
		const source = session.modelRegistry.authStorage.keys.describe(accountList.provider, session.sessionId);
		await output(
			source
				? t("slash.session.pin.noAccountsWithSource", { provider: providerName, source })
				: t("slash.session.pin.noAccounts", { provider: providerName }),
		);
		return;
	}

	const selector = arg.trim();
	if (!selector) {
		const lines = [t("slash.session.pin.title", { provider: providerName })];
		for (const account of accounts) {
			lines.push(
				t("slash.session.pin.accountLine", {
					position: account.position + 1,
					label: account.label,
					active: account.active ? t("slash.common.activeSuffix") : "",
				}),
			);
		}
		lines.push("", t("slash.session.pin.hint"));
		await output(lines.join("\n"));
		return;
	}

	const matches = matchSessionPinAccounts(accounts, selector);
	if (matches.length === 0) {
		await output(t("slash.session.pin.noMatch", { provider: providerName, selector }));
		return;
	}
	if (matches.length > 1) {
		await output(
			t("slash.session.pin.matchesMultiple", {
				selector,
				provider: providerName,
				matches: matches.map(account => `${account.position + 1}. ${account.label}`).join(", "),
			}),
		);
		return;
	}
	const account = matches[0];
	if (!account || !session.pinCurrentProviderOAuthAccount(account.credentialId)) {
		await output(t("slash.session.pin.stale", { label: account?.label ?? selector }));
		return;
	}
	await output(t("slash.session.pin.pinned", { label: account.label, provider: providerName }));
}

/**
 * Start (or reuse) the stats dashboard for this session. The Frustration page
 * judges through this session's settings and registry; its cost lands on this
 * session's ledger.
 */
function launchSessionStatsDashboard(
	args: StatsDashboardArgs,
	owner: Pick<SlashCommandRuntime, "settings" | "session" | "sessionManager">,
): Promise<StatsDashboardLaunchResult> {
	const judge = resolveJudge({
		settings: owner.settings,
		registry: owner.session.modelRegistry,
		sessionId: owner.session.sessionId,
		purpose: "stats_frustration",
		onUsage: journalJudgmentUsage(owner.sessionManager),
		telemetry: owner.session.agent.telemetry,
		cache: sharedJudgmentCache(),
	});
	return launchStatsDashboard(args, async () => judge);
}

export const BUILTIN_SESSION_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "todo",
		icon: "todo",
		get description() {
			return t("slash.todo.description");
		},
		get acpDescription() {
			return t("slash.todo.acpDescription");
		},
		acpInputHint: "<subcommand>",
		subcommands: [
			{
				name: "edit",
				get description() {
					return t("slash.todo.sub.edit.description");
				},
			},
			{
				name: "copy",
				get description() {
					return t("slash.todo.sub.copy.description");
				},
			},
			{
				name: "expand",
				get description() {
					return t("slash.todo.sub.expand.description");
				},
			},
			{
				name: "collapse",
				get description() {
					return t("slash.todo.sub.collapse.description");
				},
			},
			{
				name: "export",
				get description() {
					return t("slash.todo.sub.export.description");
				},
				usage: "[<path>]",
			},
			{
				name: "import",
				get description() {
					return t("slash.todo.sub.import.description");
				},
				usage: "[<path>]",
			},
			{
				name: "append",
				get description() {
					return t("slash.todo.sub.append.description");
				},
				usage: "[<phase>] <task...>",
			},
			{
				name: "start",
				get description() {
					return t("slash.todo.sub.start.description");
				},
				usage: "<task>",
			},
			{
				name: "done",
				get description() {
					return t("slash.todo.sub.done.description");
				},
				usage: "[<task|phase>]",
			},
			{
				name: "drop",
				get description() {
					return t("slash.todo.sub.drop.description");
				},
				usage: "[<task|phase>]",
			},
			{
				name: "rm",
				get description() {
					return t("slash.todo.sub.rm.description");
				},
				usage: "[<task|phase>]",
			},
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const tasks = runtime.ctx.todoPhases.flatMap(phase => phase.tasks);
			if (tasks.length === 0) return t("slash.todo.autocomplete.none");
			const pending = tasks.filter(task => task.status === "pending").length;
			const inProgress = tasks.filter(task => task.status === "in_progress").length;
			const completed = tasks.filter(task => task.status === "completed").length;
			return t("slash.todo.autocomplete.summary", {
				open: pending + inProgress,
				inProgress,
				completed,
			});
		},
		handle: handleTodoAcp,
		handleTui: async (command, runtime) => {
			await runtime.ctx.handleTodoCommand(command.args);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "session",
		icon: "session",
		get description() {
			return t("slash.session.description");
		},
		get acpDescription() {
			return t("slash.session.acpDescription");
		},
		acpInputHint: "[info|delete|pin [account]]",
		subcommands: [
			{
				name: "info",
				get description() {
					return t("slash.session.info");
				},
			},
			{
				name: "delete",
				get description() {
					return t("slash.session.delete");
				},
			},
			{
				name: "pin",
				get description() {
					return t("slash.session.sub.pin.description");
				},
				usage: "[account]",
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || (verb === "info" && !rest)) {
				await runtime.output(
					[
						t("slash.session.info.session", { id: runtime.session.sessionId }),
						t("slash.session.info.title", { title: runtime.session.sessionName }),
						t("slash.session.info.cwd", { cwd: runtime.cwd }),
					].join("\n"),
				);
				return commandConsumed();
			}
			if (verb === "delete" && !rest) {
				if (runtime.session.isStreaming) return usage(t("slash.session.deleteStreaming"), runtime);
				const sessionFile = runtime.sessionManager.getSessionFile();
				if (!sessionFile) return usage(t("slash.session.noFile"), runtime);
				// Route through the active SessionManager so the persist writer is
				// closed before the file is deleted. Constructing a fresh
				// FileSessionStorage and calling deleteSessionWithArtifacts leaves
				// the active writer attached to the now-deleted path, so the next
				// prompt would silently resurrect or corrupt the "deleted" file.
				try {
					await runtime.sessionManager.dropSession(sessionFile);
				} catch (err) {
					return usage(t("slash.session.deleteFailed", { reason: errorMessage(err) }), runtime);
				}
				await runtime.output(t("slash.session.deleted", { file: sessionFile }));
				return commandConsumed();
			}
			if (verb === "pin") {
				await handleSessionPinCommand(rest, runtime.session, runtime.output);
				return commandConsumed();
			}
			return usage(t("slash.session.usage"), runtime);
		},
		handleTui: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (verb === "delete" && !rest) {
				clearSubmittedText(runtime);
				await runtime.ctx.handleSessionDeleteCommand();
				return;
			}
			if (verb === "pin") {
				if (rest) {
					await handleSessionPinCommand(rest, runtime.ctx.session, text => runtime.ctx.showStatus(text));
					refreshStatusLine(runtime.ctx);
				} else {
					await runtime.ctx.showSessionPinSelector();
				}
				clearSubmittedText(runtime);
				return;
			}
			if (!verb || (verb === "info" && !rest)) {
				await runtime.ctx.handleSessionCommand();
			} else {
				runtime.ctx.showStatus(t("slash.session.usage"));
			}
			clearSubmittedText(runtime);
		},
	},
	{
		name: "jobs",
		icon: "jobs",
		get description() {
			return t("slash.jobs.description");
		},
		get acpDescription() {
			return t("slash.jobs.acpDescription");
		},
		getTuiAutocompleteDescription: runtime => {
			const snapshot = runtime.ctx.session.getAsyncJobSnapshot({ recentLimit: 5 });
			if (!snapshot || (snapshot.running.length === 0 && snapshot.recent.length === 0))
				return t("slash.jobs.autocomplete.none");
			return t("slash.jobs.autocomplete.summary", {
				running: snapshot.running.length,
				recent: snapshot.recent.length,
			});
		},
		handle: async (_command, runtime) => {
			const snapshot = runtime.session.getAsyncJobSnapshot({ recentLimit: 5 });
			if (!snapshot || (snapshot.running.length === 0 && snapshot.recent.length === 0)) {
				await runtime.output(t("slash.jobs.none"));
				return commandConsumed();
			}
			const now = Date.now();
			const lines: string[] = [t("slash.jobs.title"), t("slash.jobs.running", { count: snapshot.running.length })];
			if (snapshot.running.length > 0) {
				lines.push("", t("slash.jobs.runningJobs"));
				for (const job of snapshot.running) {
					lines.push(`  [${job.id}] ${job.type} (${job.status}) — ${formatCoarseDuration(now - job.startTime)}`);
					lines.push(`    ${job.label}`);
				}
			}
			if (snapshot.recent.length > 0) {
				lines.push("", t("slash.jobs.recentJobs"));
				for (const job of snapshot.recent) {
					lines.push(
						`  [${job.id}] ${job.type} (${job.status}) — ${formatCoarseDuration((job.endTime ?? now) - job.startTime)}`,
					);
					lines.push(`    ${job.label}`);
				}
			}
			await runtime.output(lines.join("\n"));
			return commandConsumed();
		},
		handleTui: async (_command, runtime) => {
			await runtime.ctx.handleJobsCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "usage",
		icon: "gauge",
		get description() {
			return t("slash.usage.description");
		},
		get acpDescription() {
			return t("slash.usage.acpDescription");
		},
		acpInputHint: "[show|reset [provider/credential-id|provider/active]]",
		subcommands: [
			{
				name: "show",
				get description() {
					return t("slash.usage.show");
				},
			},
			{
				name: "reset",
				get description() {
					return t("slash.usage.sub.reset.description");
				},
				usage: "[provider/credential-id|provider/active]",
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || (verb === "show" && !rest)) {
				await runtime.output(await buildUsageReportText(runtime));
				return commandConsumed();
			}
			if (verb === "reset") {
				await handleUsageResetCommand(rest, runtime.session, runtime.output);
				return commandConsumed();
			}
			return usage(t("slash.usage.usage"), runtime);
		},
		handleTui: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || (verb === "show" && !rest)) {
				await runtime.ctx.handleUsageCommand();
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "reset") {
				if (rest) {
					await handleUsageResetCommand(rest, runtime.ctx.session, text => runtime.ctx.showStatus(text));
				} else {
					await runtime.ctx.showResetUsageSelector();
				}
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus(t("slash.usage.usage"));
			clearSubmittedText(runtime);
		},
	},
	{
		name: "stats",
		icon: "stats",
		get description() {
			return t("slash.stats.description");
		},
		inlineHint: "[--port <port>] [--host <host>]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const parsed = parseStatsDashboardArgs(command.args);
			if ("error" in parsed) return usage(parsed.error, runtime);

			await runtime.output(t("slash.stats.syncing"));
			try {
				const result = await launchSessionStatsDashboard(parsed, runtime);
				await runtime.output(result.message);
			} catch (error) {
				await runtime.output(t("slash.stats.failed", { reason: errorMessage(error) }));
			}
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			const ctx = runtime.ctx;
			ctx.editor.setText("");
			const parsed = parseStatsDashboardArgs(command.args);
			if ("error" in parsed) {
				ctx.showStatus(parsed.error);
				return;
			}
			try {
				const result = await launchSessionStatsDashboard(parsed, ctx);
				ctx.presentCommandOutput(new StatsNotice(result.message, result.url));
			} catch (error) {
				ctx.showError(t("slash.stats.failed", { reason: errorMessage(error) }));
			}
		},
	},
	{
		name: "changelog",
		icon: "news",
		get description() {
			return t("slash.changelog.description");
		},
		get acpDescription() {
			return t("slash.changelog.acpDescription");
		},
		acpInputHint: "[full|last [N]]",
		subcommands: [
			{
				name: "full",
				get description() {
					return t("slash.changelog.sub.full.description");
				},
			},
			{
				name: "last",
				get description() {
					return t("slash.changelog.sub.last.description");
				},
				usage: "[N]",
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const view = parseChangelogView(command.args);
			if ("error" in view) return usage(view.error, runtime);
			const changelogPath = getChangelogPath();
			const allEntries = await parseChangelog(changelogPath);
			const entriesToShow = selectChangelogEntries(allEntries, view);
			if (entriesToShow.length === 0) {
				await runtime.output(t("slash.changelog.none"));
				return commandConsumed();
			}
			await runtime.output(renderChangelogEntries(entriesToShow).markdown);
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			await runtime.ctx.handleChangelogCommand(command.args);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "hotkeys",
		icon: "keyboard",
		get description() {
			return t("slash.hotkeys.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.handleHotkeysCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "tools",
		icon: "tools",
		get description() {
			return t("slash.tools.description");
		},
		get acpDescription() {
			return t("slash.tools.acpDescription");
		},
		getTuiAutocompleteDescription: runtime => {
			const active = runtime.ctx.session.getActiveToolNames().length;
			const all = runtime.ctx.session.getAllToolNames().length;
			return all === 0 ? t("slash.tools.autocomplete.none") : t("slash.tools.autocomplete.summary", { active, all });
		},
		handle: async (_command, runtime) => {
			const active = runtime.session.getActiveToolNames();
			const all = runtime.session.getAllToolNames();
			if (all.length === 0) {
				await runtime.output(t("slash.tools.none"));
				return commandConsumed();
			}
			const lines = all.map(name => `${active.includes(name) ? "*" : "-"} ${name}`);
			for (const mounted of runtime.session.getXdevToolEntries()) {
				lines.push(`~ xd://${mounted.name}`);
			}
			await runtime.output(lines.join("\n"));
			return commandConsumed();
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.handleToolsCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "context",
		icon: "context",
		get description() {
			return t("slash.context.description");
		},
		get acpDescription() {
			return t("slash.context.acpDescription");
		},
		getTuiAutocompleteDescription: runtime => {
			const usage = runtime.ctx.session.getContextUsage();
			if (!usage) return t("slash.context.autocomplete.unavailable");
			return t("slash.context.autocomplete.summary", {
				percent: Math.round(usage.percent),
				tokens: formatTokenCount(usage.tokens),
				window: formatTokenCount(usage.contextWindow),
			});
		},
		handle: async (_command, runtime) => {
			await runtime.output(buildContextReportText(runtime));
			return commandConsumed();
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.handleContextCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "extensions",
		aliases: ["status"],
		icon: "extension",
		get description() {
			return t("slash.extensions.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showExtensionsDashboard();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "agents",
		icon: "agents",
		get description() {
			return t("slash.agents.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showAgentsDashboard();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "git",
		icon: "branch",
		get description() {
			return t("slash.git.description");
		},
		inlineHint: "[revision]",
		allowArgs: true,
		handleTui: (command, runtime) => {
			runtime.ctx.showGitUi(command.args.trim() || undefined);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "hub",
		icon: "agents",
		get description() {
			return t("slash.hub.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showAgentHub({ initialSection: "activity" });
			clearSubmittedText(runtime);
		},
	},
	{
		name: "branch",
		aliases: ["rewind"],
		icon: "branch",
		get description() {
			return t("slash.branch.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showUserMessageSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "fork",
		icon: "branch",
		get description() {
			return t("slash.fork.description");
		},
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleForkCommand();
		},
	},
	{
		name: "tree",
		icon: "tree",
		get description() {
			return t("slash.tree.description");
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.showTreeSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "login",
		icon: "signIn",
		get description() {
			return t("slash.login.description");
		},
		inlineHint: "[provider|redirect URL]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.oauthManualInput.hasPending()
				? t("slash.login.autocomplete.waiting", {
						provider: runtime.ctx.oauthManualInput.pendingProviderId ?? "OAuth",
					})
				: t("slash.login.autocomplete.choose"),
		handleTui: (command, runtime) => {
			const manualInput = runtime.ctx.oauthManualInput;
			const args = command.args.trim();
			if (args.length > 0) {
				const matchedProvider = getOAuthProviders().find(provider => provider.id === args);
				if (matchedProvider) {
					if (manualInput.hasPending()) {
						const pendingProvider = manualInput.pendingProviderId;
						const message = pendingProvider
							? t("slash.login.pending", { provider: pendingProvider })
							: t("slash.login.pendingGeneric");
						runtime.ctx.showWarning(message);
						clearSubmittedText(runtime);
						return;
					}
					void runtime.ctx.showOAuthSelector("login", matchedProvider.id);
					clearSubmittedText(runtime);
					return;
				}
				const submitted = manualInput.submit(args);
				if (submitted) {
					runtime.ctx.showStatus(t("slash.login.callbackReceived"));
				} else {
					runtime.ctx.showWarning(t("slash.login.noPending"));
				}
				clearSubmittedText(runtime);
				return;
			}

			if (manualInput.hasPending()) {
				const provider = manualInput.pendingProviderId;
				const message = provider ? t("slash.login.pending", { provider }) : t("slash.login.pendingGeneric");
				runtime.ctx.showWarning(message);
				clearSubmittedText(runtime);
				return;
			}

			void runtime.ctx.showOAuthSelector("login");
			clearSubmittedText(runtime);
		},
	},
	{
		name: "logout",
		icon: "signOut",
		get description() {
			return t("slash.logout.description");
		},
		inlineHint: "[provider]",
		allowArgs: true,
		handleTui: (command, runtime) => {
			const providerId = command.args.trim();
			if (providerId) {
				const matchedProvider = getOAuthProviders().find(provider => provider.id === providerId);
				if (!matchedProvider) {
					runtime.ctx.showWarning(t("slash.logout.unknownProvider", { provider: providerId }));
					clearSubmittedText(runtime);
					return;
				}
				void runtime.ctx.showOAuthSelector("logout", matchedProvider.id);
				clearSubmittedText(runtime);
				return;
			}
			void runtime.ctx.showOAuthSelector("logout");
			clearSubmittedText(runtime);
		},
	},
	{
		name: "mcp",
		icon: "mcp",
		get description() {
			return t("slash.mcp.description");
		},
		get acpDescription() {
			return t("slash.mcp.acpDescription");
		},
		inlineHint: "<subcommand>",
		subcommands: [
			{
				name: "add",
				get description() {
					return t("slash.mcp.sub.add.description");
				},
				usage: "<name> [--scope project|user] [--url <url>] [-- <command...>]",
			},
			{
				name: "list",
				get description() {
					return t("slash.mcp.sub.list.description");
				},
			},
			{
				name: "remove",
				get description() {
					return t("slash.mcp.sub.remove.description");
				},
				usage: "<name> [--scope project|user]",
			},
			{
				name: "test",
				get description() {
					return t("slash.mcp.sub.test.description");
				},
				usage: "<name>",
			},
			{
				name: "reauth",
				get description() {
					return t("slash.mcp.sub.reauth.description");
				},
				usage: "<name>",
			},
			{
				name: "unauth",
				get description() {
					return t("slash.mcp.sub.unauth.description");
				},
				usage: "<name>",
			},
			{
				name: "enable",
				get description() {
					return t("slash.mcp.sub.enable.description");
				},
				usage: "<name>",
			},
			{
				name: "disable",
				get description() {
					return t("slash.mcp.sub.disable.description");
				},
				usage: "<name>",
			},
			{
				name: "smithery-search",
				get description() {
					return t("slash.mcp.sub.smitherySearch.description");
				},
				usage: "<keyword> [--scope project|user] [--limit <1-100>] [--semantic]",
			},
			{
				name: "smithery-login",
				get description() {
					return t("slash.mcp.sub.smitheryLogin.description");
				},
			},
			{
				name: "smithery-logout",
				get description() {
					return t("slash.mcp.sub.smitheryLogout.description");
				},
			},
			{
				name: "reconnect",
				get description() {
					return t("slash.mcp.sub.reconnect.description");
				},
				usage: "<name>",
			},
			{
				name: "reload",
				get description() {
					return t("slash.mcp.sub.reload.description");
				},
			},
			{
				name: "resources",
				get description() {
					return t("slash.mcp.sub.resources.description");
				},
			},
			{
				name: "prompts",
				get description() {
					return t("slash.mcp.sub.prompts.description");
				},
			},
			{
				name: "notifications",
				get description() {
					return t("slash.mcp.sub.notifications.description");
				},
			},
			{
				name: "help",
				get description() {
					return t("slash.mcp.sub.help.description");
				},
			},
		],
		allowArgs: true,
		handle: handleMcpAcp,
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleMCPCommand(command.text);
		},
	},
];
