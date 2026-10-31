import { t } from "@oh-my-pi/pi-i18n";
import { clearSubmittedText } from "./helpers/draft";
import { reset as resetCapabilities } from "../capability";
import {
	clearPluginRootsAndCaches,
	resolveActiveProjectRegistryPath,
	resolveOrDefaultProjectRegistryPath,
} from "../discovery/helpers.js";
import { PluginManager } from "../extensibility/plugins";
import { getInstalledPluginsRegistryPath, InstalledPluginManager } from "../extensibility/plugins/marketplace";
import { MCPCommandController } from "../modes/controllers/mcp-command-controller";
import type { InteractiveModeContext } from "../modes/types";
import { refreshAgentDiscovery } from "../task";
import { commandConsumed, errorMessage, parseSubcommand, usage } from "./helpers/parse";
import type { SlashCommandSpec } from "./types";

/**
 * Reload the interactive session's plugin runtime: invalidate fs/plugin-root
 * caches, rediscover skills, file slash commands, and task agents, reset the
 * capability cache, and reconnect MCP servers (rebinding the session's MCP
 * tools). Shared by `/reload-plugins`'s TUI handler and the `handle`-adapter's
 * `reloadPlugins` hook so both honor the command's documented reload scope.
 */
export async function reloadTuiPluginState(ctx: InteractiveModeContext): Promise<void> {
	const projectPath = await resolveActiveProjectRegistryPath(ctx.sessionManager.getCwd());
	clearPluginRootsAndCaches(projectPath ? [projectPath] : undefined);
	await refreshAgentDiscovery(ctx.sessionManager.getCwd(), ctx.session.effectiveExtensionRoots);
	await ctx.refreshSkillState();
	await ctx.refreshSlashCommandState();
	resetCapabilities();
	if (ctx.mcpManager) {
		await new MCPCommandController(ctx).reloadServers();
	}
}

async function createInstalledPluginManager(cwd: string): Promise<InstalledPluginManager> {
	return new InstalledPluginManager({
		installedRegistryPath: getInstalledPluginsRegistryPath(),
		projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(cwd),
	});
}

function parsePluginTarget(rest: string): { pluginId: string; scope?: "user" | "project" } | { error: string } {
	const tokens = rest.trim().split(/\s+/).filter(Boolean);
	const names: string[] = [];
	let scope: "user" | "project" | undefined;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (token === "--scope") {
			const value = tokens[++i];
			if (value !== "user" && value !== "project") {
				return { error: t("slash.plugins.usage.scope", { verb: "enable|disable" }) };
			}
			scope = value;
		} else if (token.startsWith("-")) {
			return { error: t("slash.plugins.usage.scope", { verb: "enable|disable" }) };
		} else {
			names.push(token);
		}
	}
	if (names.length !== 1) return { error: t("slash.plugins.usage.scope", { verb: "enable|disable" }) };
	return { pluginId: names[0]!, scope };
}

export const BUILTIN_MARKETPLACE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "plugins",
		aliases: ["plugin"],
		icon: "package",
		get description() {
			return t("slash.plugins.description");
		},
		get acpDescription() {
			return t("slash.plugins.acpDescription");
		},
		acpInputHint: "[list|enable|disable]",
		subcommands: [
			{
				name: "list",
				get description() {
					return t("slash.plugins.sub.list.description");
				},
			},
			{
				name: "enable",
				get description() {
					return t("slash.plugins.sub.enable.description");
				},
				usage: "<name@marketplace>",
			},
			{
				name: "disable",
				get description() {
					return t("slash.plugins.sub.disable.description");
				},
				usage: "<name@marketplace>",
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			try {
				if (verb === "enable" || verb === "disable") {
					const parsed = parsePluginTarget(rest);
					if ("error" in parsed) return usage(parsed.error, runtime);
					const isEnable = verb === "enable";
					await setPluginEnabled(runtime.cwd, parsed.pluginId, isEnable, parsed.scope);
					await runtime.reloadPlugins();
					await runtime.output(
						isEnable
							? t("slash.plugins.enabled", { name: parsed.pluginId })
							: t("slash.plugins.disabled", { name: parsed.pluginId }),
					);
					return commandConsumed();
				}
				// Default: list
				const lines: string[] = [];
				const npmManager = new PluginManager();
				const npmPlugins = await npmManager.list();
				if (npmPlugins.length > 0) {
					lines.push(t("slash.plugins.npmHeader"));
					for (const plugin of npmPlugins) {
						const status = plugin.enabled === false ? t("slash.plugins.disabledSuffix") : "";
						lines.push(`  ${plugin.name}@${plugin.version}${status}`);
					}
				}

				const installedManager = await createInstalledPluginManager(runtime.cwd);
				const marketplacePlugins = await installedManager.listInstalledPlugins();
				if (marketplacePlugins.length > 0) {
					if (lines.length > 0) lines.push("");
					lines.push(t("slash.plugins.marketplaceHeader"));
					for (const plugin of marketplacePlugins) {
						const entry = plugin.entries[0];
						const status = entry?.enabled === false ? t("slash.plugins.disabledSuffix") : "";
						const shadowed = plugin.shadowedBy ? t("slash.marketplace.shadowed") : "";
						lines.push(`  ${plugin.id} v${entry?.version ?? "?"}${status} [${plugin.scope}]${shadowed}`);
					}
				}

				await runtime.output(lines.length === 0 ? t("slash.plugins.none") : lines.join("\n"));
				return commandConsumed();
			} catch (err) {
				return usage(t("slash.plugins.error", { error: errorMessage(err) }), runtime);
			}
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const args = command.args.trim().split(/\s+/);
			const sub = args[0] || "list";
			const rest = args.slice(1).join(" ").trim();

			try {
				if (sub === "enable" || sub === "disable") {
					const parsed = parsePluginTarget(rest ?? "");
					if ("error" in parsed) {
						runtime.ctx.showStatus(parsed.error);
						return;
					}
					const isEnable = sub === "enable";
					await setPluginEnabled(runtime.ctx.sessionManager.getCwd(), parsed.pluginId, isEnable, parsed.scope);
					runtime.ctx.showStatus(
						isEnable
							? t("slash.plugins.enabled", { name: parsed.pluginId })
							: t("slash.plugins.disabled", { name: parsed.pluginId }),
					);
					return;
				}

				const lines: string[] = [];

				const npm = new PluginManager();
				const npmPlugins = await npm.list();
				if (npmPlugins.length > 0) {
					lines.push(t("slash.plugins.npmHeader"));
					for (const p of npmPlugins) {
						const status = p.enabled === false ? t("slash.plugins.disabledSuffix") : "";
						lines.push(`  ${p.name}@${p.version}${status}`);
					}
				}

				const installedManager = await createInstalledPluginManager(runtime.ctx.sessionManager.getCwd());
				const mktPlugins = await installedManager.listInstalledPlugins();
				if (mktPlugins.length > 0) {
					if (lines.length > 0) lines.push("");
					lines.push(t("slash.plugins.marketplaceHeader"));
					for (const p of mktPlugins) {
						const entry = p.entries[0];
						const status = entry?.enabled === false ? t("slash.plugins.disabledSuffix") : "";
						const shadowed = p.shadowedBy ? t("slash.marketplace.shadowed") : "";
						lines.push(`  ${p.id} v${entry?.version ?? "?"}${status} [${p.scope}]${shadowed}`);
					}
				}

				if (lines.length === 0) {
					runtime.ctx.showStatus(t("slash.plugins.none"));
				} else {
					runtime.ctx.showStatus(lines.join("\n"));
				}
			} catch (err) {
				runtime.ctx.showStatus(t("slash.plugins.error", { error: String(err) }));
			}
		},
	},
	{
		name: "reload-plugins",
		icon: "restart",
		get description() {
			return t("slash.reload.description");
		},
		get acpDescription() {
			return t("slash.reload.acpDescription");
		},
		handle: async (_command, runtime) => {
			await runtime.reloadPlugins();
			await runtime.output(t("slash.reload.done"));
			return commandConsumed();
		},
		handleTui: async (_command, runtime) => {
			await reloadTuiPluginState(runtime.ctx);
			runtime.ctx.showStatus(t("slash.reload.done"));
			clearSubmittedText(runtime);
		},
	},
];

/** Enable or disable an npm or registry-installed plugin by id/name. */
async function setPluginEnabled(
	cwd: string,
	name: string,
	enabled: boolean,
	scope?: "user" | "project",
): Promise<void> {
	const installedManager = await createInstalledPluginManager(cwd);
	const installed = new Set((await installedManager.listInstalledPlugins()).map(plugin => plugin.id));
	if (installed.has(name)) {
		await installedManager.setPluginEnabled(name, enabled, scope);
		return;
	}
	await new PluginManager().setEnabled(name, enabled);
}
