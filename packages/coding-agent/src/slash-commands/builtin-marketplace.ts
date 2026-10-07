import { t } from "@oh-my-pi/pi-i18n";
import { clearSubmittedText } from "./helpers/draft";
import { reset as resetCapabilities } from "../capability";
import {
	clearPluginRootsAndCaches,
	resolveActiveProjectRegistryPath,
	resolveOrDefaultProjectRegistryPath,
} from "../discovery/helpers.js";
import { PluginManager } from "../extensibility/plugins";
import {
	getInstalledPluginsRegistryPath,
	getMarketplacesCacheDir,
	getMarketplacesRegistryPath,
	getPluginsCacheDir,
	MarketplaceManager,
} from "../extensibility/plugins/marketplace";
import { MCPCommandController } from "../modes/controllers/mcp-command-controller";
import type { InteractiveModeContext } from "../modes/types";
import { refreshAgentDiscovery } from "../task";
import { createMarketplaceManager } from "./helpers/marketplace-manager";
import { commandConsumed, errorMessage, parseSubcommand, usage } from "./helpers/parse";
import { parseMarketplaceInstallArgs, parsePluginScopeArgs } from "./marketplace-install-parser";
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

export const BUILTIN_MARKETPLACE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "marketplace",
		icon: "cart",
		get description() {
			return t("slash.marketplace.description");
		},
		get acpDescription() {
			return t("slash.marketplace.acpDescription");
		},
		acpInputHint: "<subcommand>",
		subcommands: [
			{
				name: "add",
				get description() {
					return t("slash.marketplace.sub.add.description");
				},
				usage: "<source>",
			},
			{
				name: "remove",
				get description() {
					return t("slash.marketplace.sub.remove.description");
				},
				usage: "<name>",
			},
			{
				name: "update",
				get description() {
					return t("slash.marketplace.sub.update.description");
				},
				usage: "[name]",
			},
			{
				name: "list",
				get description() {
					return t("slash.marketplace.sub.list.description");
				},
			},
			{
				name: "discover",
				get description() {
					return t("slash.marketplace.sub.discover.description");
				},
				usage: "[marketplace]",
			},
			{
				name: "install",
				get description() {
					return t("slash.marketplace.sub.install.description");
				},
				usage: "[--force] [name@marketplace]",
			},
			{
				name: "uninstall",
				get description() {
					return t("slash.marketplace.sub.uninstall.description");
				},
				usage: "[name@marketplace]",
			},
			{
				name: "installed",
				get description() {
					return t("slash.marketplace.sub.installed.description");
				},
			},
			{
				name: "upgrade",
				get description() {
					return t("slash.marketplace.sub.upgrade.description");
				},
				usage: "[name@marketplace]",
			},
			{
				name: "help",
				get description() {
					return t("slash.marketplace.sub.help.description");
				},
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb) {
				try {
					const manager = await createMarketplaceManager(runtime);
					const marketplaces = await manager.listMarketplaces();
					if (marketplaces.length === 0) {
						await runtime.output(
							[
								t("slash.marketplace.none.header"),
								"",
								t("slash.marketplace.none.getStarted"),
								t("slash.marketplace.exampleAdd"),
								"",
								t("slash.marketplace.none.thenDiscover"),
							].join("\n"),
						);
					} else {
						const lines = marketplaces.map(m => `  ${m.name}  ${m.sourceUri}`);
						await runtime.output(
							[t("slash.marketplace.list.header"), lines.join("\n"), "", t("slash.marketplace.list.hint")].join(
								"\n",
							),
						);
					}
					return commandConsumed();
				} catch (err) {
					return usage(t("slash.marketplace.error", { error: errorMessage(err) }), runtime);
				}
			}
			if (verb === "help") {
				await runtime.output(
					[
						t("slash.marketplace.help.title"),
						t("slash.marketplace.help.list"),
						t("slash.marketplace.help.add"),
						t("slash.marketplace.help.remove"),
						t("slash.marketplace.help.update"),
						t("slash.marketplace.help.listCmd"),
						t("slash.marketplace.help.discover"),
						t("slash.marketplace.help.install"),
						t("slash.marketplace.help.uninstall"),
						t("slash.marketplace.help.installed"),
						t("slash.marketplace.help.upgrade"),
						"",
						t("slash.marketplace.help.quickStart"),
						t("slash.marketplace.exampleAdd"),
					].join("\n"),
				);
				return commandConsumed();
			}
			if ((verb === "install" || verb === "uninstall") && !rest) {
				return usage(t("slash.marketplace.pickersTuiOnly"), runtime);
			}
			try {
				const manager = await createMarketplaceManager(runtime);
				switch (verb) {
					case "add": {
						if (!rest) return usage(t("slash.marketplace.usage.add"), runtime);
						const entry = await manager.addMarketplace(rest);
						await runtime.output(t("slash.marketplace.added", { name: entry.name }));
						return commandConsumed();
					}
					case "remove":
					case "rm": {
						if (!rest) return usage(t("slash.marketplace.usage.remove"), runtime);
						await manager.removeMarketplace(rest);
						await runtime.output(t("slash.marketplace.removed", { name: rest }));
						return commandConsumed();
					}
					case "update": {
						if (rest) {
							await manager.updateMarketplace(rest);
							await runtime.output(t("slash.marketplace.updated", { name: rest }));
						} else {
							const results = await manager.updateAllMarketplaces();
							await runtime.output(t("slash.marketplace.updatedAll", { count: results.length }));
						}
						return commandConsumed();
					}
					case "list": {
						const marketplaces = await manager.listMarketplaces();
						if (marketplaces.length === 0) {
							await runtime.output(t("slash.marketplace.none.header"));
						} else {
							const lines = marketplaces.map(m => `  ${m.name}  ${m.sourceUri}`);
							await runtime.output([t("slash.marketplace.list.header"), lines.join("\n")].join("\n"));
						}
						return commandConsumed();
					}
					case "discover": {
						const plugins = await manager.listAvailablePlugins(rest || undefined);
						if (plugins.length === 0) {
							const marketplaces = await manager.listMarketplaces();
							await runtime.output(
								marketplaces.length === 0
									? [t("slash.marketplace.none.tryHeader"), t("slash.marketplace.exampleAdd")].join("\n")
									: t("slash.marketplace.noPlugins"),
							);
							return commandConsumed();
						}
						const lines = [t("slash.marketplace.available")];
						for (const plugin of plugins) {
							lines.push(`  - ${plugin.name}${plugin.version ? `@${plugin.version}` : ""}`);
							if (plugin.description) lines.push(`      ${plugin.description}`);
						}
						await runtime.output(lines.join("\n"));
						return commandConsumed();
					}
					case "install": {
						const parsed = parseMarketplaceInstallArgs(rest);
						if ("error" in parsed) return usage(parsed.error, runtime);
						const atIndex = parsed.installSpec.lastIndexOf("@");
						const pluginName = parsed.installSpec.slice(0, atIndex);
						const marketplace = parsed.installSpec.slice(atIndex + 1);
						await manager.installPlugin(pluginName, marketplace, { force: parsed.force, scope: parsed.scope });
						await runtime.reloadPlugins();
						await runtime.output(t("slash.marketplace.installed", { name: pluginName, marketplace }));
						return commandConsumed();
					}
					case "uninstall": {
						const parsed = parsePluginScopeArgs(rest, t("slash.marketplace.usage.uninstall"));
						if ("error" in parsed) return usage(parsed.error, runtime);
						await manager.uninstallPlugin(parsed.pluginId, parsed.scope);
						await runtime.reloadPlugins();
						await runtime.output(t("slash.marketplace.uninstalled", { name: parsed.pluginId }));
						return commandConsumed();
					}
					case "installed": {
						const installed = await manager.listInstalledPlugins();
						if (installed.length === 0) {
							await runtime.output(t("slash.marketplace.noneInstalled"));
						} else {
							const lines = installed.map(
								p =>
									`  ${p.id} [${p.scope}]${p.shadowedBy ? t("slash.marketplace.shadowed") : ""}${t("slash.marketplace.entries", { count: p.entries.length })}`,
							);
							await runtime.output([t("slash.marketplace.installedHeader"), lines.join("\n")].join("\n"));
						}
						return commandConsumed();
					}
					case "upgrade": {
						if (rest) {
							const parsed = parsePluginScopeArgs(rest, t("slash.marketplace.usage.upgrade"));
							if ("error" in parsed) return usage(parsed.error, runtime);
							const result = await manager.upgradePlugin(parsed.pluginId, parsed.scope);
							await runtime.reloadPlugins();
							await runtime.output(
								t("slash.marketplace.upgraded", { name: parsed.pluginId, version: result.version }),
							);
							return commandConsumed();
						}
						const results = await manager.upgradeAllPlugins();
						if (results.length === 0) {
							await runtime.output(t("slash.marketplace.allUpToDate"));
						} else {
							await runtime.reloadPlugins();
							const lines = results.map(r => `  ${r.pluginId}: ${r.from} -> ${r.to}`);
							await runtime.output(
								[t("slash.marketplace.upgradedAll", { count: results.length }), lines.join("\n")].join("\n"),
							);
						}
						return commandConsumed();
					}
					default:
						return usage(t("slash.marketplace.unknownSub", { verb }), runtime);
				}
			} catch (err) {
				return usage(t("slash.marketplace.error", { error: errorMessage(err) }), runtime);
			}
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const args = command.args.trim().split(/\s+/);
			const sub = args[0] || "install";
			const rest = args.slice(1).join(" ").trim();

			// /marketplace (no args) or /marketplace install (no args) → interactive browser
			if ((sub === "install" && !rest) || (!args[0] && !command.args.trim())) {
				try {
					runtime.ctx.showPluginSelector("install");
				} catch (err) {
					runtime.ctx.showStatus(t("slash.marketplace.error", { error: String(err) }));
				}
				return;
			}

			const mgr = new MarketplaceManager({
				marketplacesRegistryPath: getMarketplacesRegistryPath(),
				installedRegistryPath: getInstalledPluginsRegistryPath(),
				projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(
					runtime.ctx.sessionManager.getCwd(),
				),
				marketplacesCacheDir: getMarketplacesCacheDir(),
				pluginsCacheDir: getPluginsCacheDir(),
				clearPluginRootsCache: clearPluginRootsAndCaches,
			});

			try {
				switch (sub) {
					case "add": {
						if (!rest) {
							runtime.ctx.showStatus(t("slash.marketplace.usage.add"));
							return;
						}
						const entry = await mgr.addMarketplace(rest);
						runtime.ctx.showStatus(t("slash.marketplace.added", { name: entry.name }));
						break;
					}
					case "remove":
					case "rm": {
						if (!rest) {
							runtime.ctx.showStatus(t("slash.marketplace.usage.remove"));
							return;
						}
						await mgr.removeMarketplace(rest);
						runtime.ctx.showStatus(t("slash.marketplace.removed", { name: rest }));
						break;
					}
					case "update": {
						if (rest) {
							await mgr.updateMarketplace(rest);
							runtime.ctx.showStatus(t("slash.marketplace.updated", { name: rest }));
						} else {
							const results = await mgr.updateAllMarketplaces();
							runtime.ctx.showStatus(t("slash.marketplace.updatedAll", { count: results.length }));
						}
						break;
					}
					case "discover": {
						const plugins = await mgr.listAvailablePlugins(rest || undefined);
						if (plugins.length === 0) {
							const marketplaces = await mgr.listMarketplaces();
							if (marketplaces.length === 0) {
								runtime.ctx.showStatus(
									[t("slash.marketplace.none.tryHeader"), t("slash.marketplace.exampleAdd")].join("\n"),
								);
							} else {
								runtime.ctx.showStatus(t("slash.marketplace.noPlugins"));
							}
						} else {
							const lines = plugins.map(
								p =>
									`  ${p.name}${p.version ? `@${p.version}` : ""}${p.description ? ` - ${p.description}` : ""}`,
							);
							runtime.ctx.showStatus([t("slash.marketplace.available"), lines.join("\n")].join("\n"));
						}
						break;
					}
					case "install": {
						// Parse: /marketplace install [--force] [--scope user|project] name@marketplace
						const parsed = parseMarketplaceInstallArgs(rest);
						if ("error" in parsed) {
							runtime.ctx.showStatus(parsed.error);
							return;
						}
						const atIdx = parsed.installSpec.lastIndexOf("@");
						const name = parsed.installSpec.slice(0, atIdx);
						const marketplace = parsed.installSpec.slice(atIdx + 1);
						await mgr.installPlugin(name, marketplace, { force: parsed.force, scope: parsed.scope });
						runtime.ctx.showStatus(t("slash.marketplace.installed", { name, marketplace }));
						break;
					}
					case "uninstall": {
						if (!rest) {
							// No args → open interactive uninstall selector
							runtime.ctx.showPluginSelector("uninstall");
							return;
						}
						const uninstArgs = parsePluginScopeArgs(rest, t("slash.marketplace.usage.uninstall"));
						if ("error" in uninstArgs) {
							runtime.ctx.showStatus(uninstArgs.error);
							return;
						}
						await mgr.uninstallPlugin(uninstArgs.pluginId, uninstArgs.scope);
						runtime.ctx.showStatus(t("slash.marketplace.uninstalled", { name: uninstArgs.pluginId }));
						break;
					}
					case "installed": {
						const installed = await mgr.listInstalledPlugins();
						if (installed.length === 0) {
							runtime.ctx.showStatus(t("slash.marketplace.noneInstalled"));
						} else {
							const lines = installed.map(
								p =>
									`  ${p.id} [${p.scope}]${p.shadowedBy ? t("slash.marketplace.shadowed") : ""}${t("slash.marketplace.entries", { count: p.entries.length })}`,
							);
							runtime.ctx.showStatus([t("slash.marketplace.installedHeader"), lines.join("\n")].join("\n"));
						}
						break;
					}
					case "upgrade": {
						if (rest) {
							const upArgs = parsePluginScopeArgs(rest, t("slash.marketplace.usage.upgrade"));
							if ("error" in upArgs) {
								runtime.ctx.showStatus(upArgs.error);
								return;
							}
							const result = await mgr.upgradePlugin(upArgs.pluginId, upArgs.scope);
							runtime.ctx.showStatus(
								t("slash.marketplace.upgraded", { name: upArgs.pluginId, version: result.version }),
							);
						} else {
							const results = await mgr.upgradeAllPlugins();
							if (results.length === 0) {
								runtime.ctx.showStatus(t("slash.marketplace.allUpToDate"));
							} else {
								const lines = results.map(r => `  ${r.pluginId}: ${r.from} -> ${r.to}`);
								runtime.ctx.showStatus(
									[t("slash.marketplace.upgradedAll", { count: results.length }), lines.join("\n")].join("\n"),
								);
							}
						}
						break;
					}
					case "help": {
						runtime.ctx.showStatus(
							[
								t("slash.marketplace.help.title"),
								t("slash.marketplace.help.tui.list"),
								t("slash.marketplace.help.add"),
								t("slash.marketplace.help.remove"),
								t("slash.marketplace.help.update"),
								t("slash.marketplace.help.listCmd"),
								t("slash.marketplace.help.discover"),
								t("slash.marketplace.help.install"),
								t("slash.marketplace.help.uninstall"),
								t("slash.marketplace.help.installed"),
								t("slash.marketplace.help.upgrade"),
								"",
								t("slash.marketplace.help.quickStart"),
								t("slash.marketplace.exampleAdd"),
								t("slash.marketplace.help.tui.openBrowser"),
							].join("\n"),
						);
						break;
					}
					default: {
						const marketplaces = await mgr.listMarketplaces();
						if (marketplaces.length === 0) {
							runtime.ctx.showStatus(
								[
									t("slash.marketplace.none.header"),
									"",
									t("slash.marketplace.none.getStarted"),
									t("slash.marketplace.exampleAdd"),
									"",
									t("slash.marketplace.none.thenBrowseTui"),
								].join("\n"),
							);
						} else {
							const lines = marketplaces.map(m => `  ${m.name}  ${m.sourceUri}`);
							runtime.ctx.showStatus(
								[
									t("slash.marketplace.list.header"),
									lines.join("\n"),
									"",
									t("slash.marketplace.list.hint"),
								].join("\n"),
							);
						}
						break;
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				runtime.ctx.showStatus(t("slash.marketplace.error", { error: msg }));
			}
		},
	},
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
					const parsed = parsePluginScopeArgs(rest, t("slash.plugins.usage.scope", { verb }));
					if ("error" in parsed) return usage(parsed.error, runtime);
					const manager = await createMarketplaceManager(runtime);
					const isEnable = verb === "enable";
					await manager.setPluginEnabled(parsed.pluginId, isEnable, parsed.scope);
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

				const marketplaceManager = await createMarketplaceManager(runtime);
				const marketplacePlugins = await marketplaceManager.listInstalledPlugins();
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
				const mgr = new MarketplaceManager({
					marketplacesRegistryPath: getMarketplacesRegistryPath(),
					installedRegistryPath: getInstalledPluginsRegistryPath(),
					projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(
						runtime.ctx.sessionManager.getCwd(),
					),
					marketplacesCacheDir: getMarketplacesCacheDir(),
					pluginsCacheDir: getPluginsCacheDir(),
					clearPluginRootsCache: clearPluginRootsAndCaches,
				});

				switch (sub) {
					case "enable":
					case "disable": {
						const parsed = parsePluginScopeArgs(rest ?? "", t("slash.plugins.usage.scope", { verb: sub }));
						if ("error" in parsed) {
							runtime.ctx.showStatus(parsed.error);
							return;
						}
						const isEnable = sub === "enable";
						await mgr.setPluginEnabled(parsed.pluginId, isEnable, parsed.scope);
						runtime.ctx.showStatus(
							isEnable
								? t("slash.plugins.enabled", { name: parsed.pluginId })
								: t("slash.plugins.disabled", { name: parsed.pluginId }),
						);
						break;
					}
					default: {
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

						const mktPlugins = await mgr.listInstalledPlugins();
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
						break;
					}
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
