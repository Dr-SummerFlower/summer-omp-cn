/**
 * Plugin CLI command handlers.
 *
 * Handles `omp plugin <command>` subcommands for plugin lifecycle management.
 */

import * as path from "node:path";
import { APP_NAME, getPluginsNodeModules, getProjectDir } from "@oh-my-pi/pi-utils";
import chalk from "@oh-my-pi/pi-utils/chalk";
import { resolveOrDefaultProjectRegistryPath } from "../discovery/helpers";
import { PluginManager, parseSettingValue, validateSetting } from "../extensibility/plugins";
import {
	getInstalledPluginsRegistryPath,
	InstalledPluginManager,
	parsePluginId,
} from "../extensibility/plugins/marketplace/index.js";
import type { InstalledPlugin } from "../extensibility/plugins/types";
import { theme } from "@oh-my-pi/pi-tui/theme";

// =============================================================================
// Types
// =============================================================================

export type PluginAction =
	| "install"
	| "uninstall"
	| "list"
	| "link"
	| "doctor"
	| "features"
	| "config"
	| "enable"
	| "disable";

export interface PluginCommandArgs {
	action: PluginAction;
	args: string[];
	flags: {
		json?: boolean;
		fix?: boolean;
		force?: boolean;
		dryRun?: boolean;
		local?: boolean;
		enable?: string;
		disable?: string;
		set?: string;
		scope?: "user" | "project";
	};
}

// =============================================================================
// Argument Parser
// =============================================================================

const VALID_ACTIONS: PluginAction[] = [
	"install",
	"uninstall",
	"list",
	"link",
	"doctor",
	"features",
	"config",
	"enable",
	"disable",
];

/**
 * Parse plugin subcommand arguments.
 * Returns undefined if not a plugin command.
 */
export function parsePluginArgs(args: string[]): PluginCommandArgs | undefined {
	if (args.length === 0 || args[0] !== "plugin") {
		return undefined;
	}

	if (args.length < 2) {
		return { action: "list", args: [], flags: {} };
	}

	const action = args[1];
	if (!VALID_ACTIONS.includes(action as PluginAction)) {
		console.error(chalk.red(`Unknown plugin command: ${action}`));
		console.error(`Valid commands: ${VALID_ACTIONS.join(", ")}`);
		process.exit(1);
	}

	const result: PluginCommandArgs = {
		action: action as PluginAction,
		args: [],
		flags: {},
	};

	// Parse remaining arguments
	for (let i = 2; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--json") {
			result.flags.json = true;
		} else if (arg === "--fix") {
			result.flags.fix = true;
		} else if (arg === "--force") {
			result.flags.force = true;
		} else if (arg === "--dry-run") {
			result.flags.dryRun = true;
		} else if (arg === "-l" || arg === "--local") {
			result.flags.local = true;
		} else if (arg === "--enable" && i + 1 < args.length) {
			result.flags.enable = args[++i];
		} else if (arg === "--disable" && i + 1 < args.length) {
			result.flags.disable = args[++i];
		} else if (arg === "--set" && i + 1 < args.length) {
			result.flags.set = args[++i];
		} else if (arg === "--scope" && i + 1 < args.length && !args[i + 1].startsWith("-")) {
			const s = args[++i];
			if (s === "user" || s === "project") {
				result.flags.scope = s;
			} else {
				console.error(chalk.red(`Invalid --scope value: "${s}". Must be "user" or "project".`));
				process.exit(1);
			}
		} else if (arg === "--scope") {
			// --scope with no value following
			console.error(chalk.red(`--scope requires a value: "user" or "project".`));
			process.exit(1);
		} else if (!arg.startsWith("-")) {
			result.args.push(arg);
		}
	}

	return result;
}

import { classifyInstallTarget } from "./classify-install-target";
import { t } from "@oh-my-pi/pi-i18n";

export { classifyInstallTarget } from "./classify-install-target";

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Run a plugin command.
 */
export async function runPluginCommand(cmd: PluginCommandArgs): Promise<void> {
	const manager = new PluginManager();

	switch (cmd.action) {
		case "install":
			await handleInstall(manager, cmd.args, cmd.flags);
			break;
		case "uninstall":
			await handleUninstall(manager, cmd.args, cmd.flags);
			break;
		case "list":
			await handleList(manager, cmd.flags);
			break;
		case "link":
			await handleLink(manager, cmd.args, cmd.flags);
			break;
		case "doctor":
			await handleDoctor(manager, cmd.flags);
			break;
		case "features":
			await handleFeatures(manager, cmd.args, cmd.flags);
			break;
		case "config":
			await handleConfig(manager, cmd.args, cmd.flags);
			break;
		case "enable":
			await handleEnable(manager, cmd.args, cmd.flags);
			break;
		case "disable":
			await handleDisable(manager, cmd.args, cmd.flags);
			break;
	}
}

// =============================================================================
// Installed marketplace-plugin metadata
// =============================================================================

async function makeInstalledPluginManager(): Promise<InstalledPluginManager> {
	return new InstalledPluginManager({
		installedRegistryPath: getInstalledPluginsRegistryPath(),
		projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(getProjectDir()),
	});
}

function printLinkPreview(pluginPath: string, json?: boolean): void {
	if (json) {
		console.log(JSON.stringify({ dryRun: true, action: "link", path: pluginPath }, null, 2));
	} else {
		console.log(chalk.dim(`[dry-run] Would link ${pluginPath}`));
	}
}

async function handleInstall(
	manager: PluginManager,
	packages: string[],
	flags: { json?: boolean; force?: boolean; dryRun?: boolean },
): Promise<void> {
	if (packages.length === 0) {
		console.error(chalk.red(`Usage: ${APP_NAME} plugin install <source>[features] ...`));
		console.error(chalk.dim("Examples:"));
		console.error(chalk.dim(`  ${APP_NAME} plugin install @oh-my-pi/exa`));
		console.error(chalk.dim(`  ${APP_NAME} plugin install github:user/repo`));
		console.error(chalk.dim(`  ${APP_NAME} plugin install https://github.com/user/repo#v1.0`));
		console.error(chalk.dim(`  ${APP_NAME} plugin install ./path/to/local/plugin`));
		process.exit(1);
	}

	for (const spec of packages) {
		const target = classifyInstallTarget(spec);

		if (target.type === "local") {
			// Local paths route to link(): symlink the directory into the plugins
			// node_modules tree so source edits show up without a reinstall. Matches
			// `omp plugin link <path>` so users can use either verb interchangeably.
			if (flags.force) {
				console.error(
					chalk.yellow(
						`Warning: --force has no effect for local path installs (link is already idempotent). Ignoring for ${spec}.`,
					),
				);
			}
			if (flags.dryRun) {
				printLinkPreview(spec, flags.json);
				continue;
			}
			try {
				const result = await manager.link(target.path);
				if (flags.json) {
					console.log(JSON.stringify(result, null, 2));
				} else {
					console.log(chalk.green(`${theme.status.success} Linked ${result.name} from ${spec}`));
					if (result.manifest.description) {
						console.log(chalk.dim(`  ${result.manifest.description}`));
					}
				}
			} catch (err) {
				console.error(chalk.red(`${theme.status.error} Failed to install ${spec}: ${err}`));
				process.exit(1);
			}
			continue;
		}

		// npm path
		try {
			const result = await manager.install(spec, { force: flags.force, dryRun: flags.dryRun });

			if (flags.json) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				if (flags.dryRun) {
					console.log(chalk.dim(`[dry-run] Would install ${spec}`));
				} else {
					console.log(chalk.green(`${theme.status.success} Installed ${result.name}@${result.version}`));
					if (result.enabledFeatures && result.enabledFeatures.length > 0) {
						console.log(chalk.dim(`  Features: ${result.enabledFeatures.join(", ")}`));
					}
					if (result.manifest.description) {
						console.log(chalk.dim(`  ${result.manifest.description}`));
					}
				}
			}
		} catch (err) {
			console.error(chalk.red(`${theme.status.error} Failed to install ${spec}: ${err}`));
			process.exit(1);
		}
	}
}

async function handleUninstall(
	manager: PluginManager,
	packages: string[],
	flags: { json?: boolean; dryRun?: boolean; scope?: "user" | "project" },
): Promise<void> {
	if (packages.length === 0) {
		console.error(chalk.red(`Usage: ${APP_NAME} plugin uninstall <package> ...`));
		process.exit(1);
	}

	// For uninstall, check the installed plugins registry directly.
	const installedManager = await makeInstalledPluginManager();
	const installedIds = (await installedManager.listInstalledPlugins()).map(p => p.id);
	const installedPlugins = new Set(installedIds);

	// Installed marketplace IDs are `name@marketplace`, so a bare name never matches one
	// exactly. Resolve it when exactly one marketplace supplies that name: without this the
	// bare form falls through to the npm path, where `bun uninstall` exits 0 for a package
	// that was never a dependency and the command reports a removal that did not happen.
	const marketplaceIdsFor = (name: string): string[] =>
		installedIds.filter(id => id.slice(0, id.lastIndexOf("@")) === name);

	for (const rawName of packages) {
		let name = rawName;
		if (!installedPlugins.has(name)) {
			const candidates = marketplaceIdsFor(name);
			if (candidates.length === 1) {
				name = candidates[0] as string;
			} else if (candidates.length > 1) {
				console.error(
					chalk.red(
						`${theme.status.error} ${rawName} is installed from ${candidates.length} marketplaces. Qualify it: ${candidates.join(", ")}`,
					),
				);
				process.exit(1);
			}
		}

		const viaMarketplace = installedPlugins.has(name);

		if (flags.dryRun) {
			if (flags.json) {
				console.log(
					JSON.stringify({
						dryRun: true,
						action: "uninstall",
						plugin: name,
						source: viaMarketplace ? "marketplace" : "npm",
					}),
				);
			} else {
				console.log(chalk.dim(`[dry-run] Would uninstall ${name}`));
			}
			continue;
		}

		if (viaMarketplace) {
			// Exact match against installed marketplace plugin IDs (name@marketplace)
			try {
				await installedManager.uninstallPlugin(name, flags.scope);
				console.log(chalk.green(`${theme.status.success} Uninstalled ${name}`));
			} catch (err) {
				console.error(chalk.red(`${theme.status.error} Failed to uninstall ${name}: ${err}`));
				process.exit(1);
			}
			continue;
		}

		// npm path. `bun uninstall` exits 0 for a package that is not a dependency, so an
		// unknown name would otherwise print a success line having removed nothing.
		const npmPlugins = await manager.list();
		if (!npmPlugins.some(p => p.name === name)) {
			console.error(chalk.red(`${theme.status.error} ${rawName} is not installed`));
			process.exit(1);
		}

		try {
			await manager.uninstall(name);
			if (flags.json) {
				console.log(JSON.stringify({ uninstalled: name }));
			} else {
				console.log(chalk.green(`${theme.status.success} Uninstalled ${name}`));
			}
		} catch (err) {
			console.error(chalk.red(`${theme.status.error} Failed to uninstall ${name}: ${err}`));
			process.exit(1);
		}
	}
}

async function handleList(manager: PluginManager, flags: { json?: boolean }): Promise<void> {
	const npmPlugins = await manager.list();
	const installedManager = await makeInstalledPluginManager();
	const installedPlugins = await installedManager.listInstalledPlugins();

	if (flags.json) {
		console.log(JSON.stringify({ npm: npmPlugins, marketplace: installedPlugins }, null, 2));
		return;
	}

	if (npmPlugins.length === 0 && installedPlugins.length === 0) {
		console.log(chalk.dim("No plugins installed"));
		console.log(chalk.dim(`\nInstall plugins with: ${APP_NAME} plugin install <package>`));
		return;
	}

	if (npmPlugins.length > 0) {
		console.log(chalk.bold("npm Plugins:\n"));
		for (const plugin of npmPlugins) {
			const status = plugin.enabled ? chalk.green(theme.status.enabled) : chalk.dim(theme.status.disabled);
			const nameVersion = `${plugin.name}@${plugin.version}`;
			console.log(`${status} ${nameVersion}`);
			if (plugin.manifest.description) {
				console.log(chalk.dim(`  ${plugin.manifest.description}`));
			}
			if (plugin.enabledFeatures && plugin.enabledFeatures.length > 0) {
				console.log(chalk.dim(`  Features: ${plugin.enabledFeatures.join(", ")}`));
			}
			if (plugin.manifest.features) {
				const availableFeatures = Object.keys(plugin.manifest.features);
				if (availableFeatures.length > 0) {
					const enabledSet = new Set(plugin.enabledFeatures ?? []);
					const featureDisplay = availableFeatures
						.map(f => (enabledSet.has(f) ? chalk.green(f) : chalk.dim(f)))
						.join(", ");
					console.log(chalk.dim(`  Available: [${featureDisplay}]`));
				}
			}
		}
	}

	if (installedPlugins.length > 0) {
		if (npmPlugins.length > 0) console.log();
		console.log(chalk.bold("Marketplace Plugins:\n"));
		for (const plugin of installedPlugins) {
			const entry = plugin.entries[0];
			const version = entry?.version ?? "unknown";
			const shadowLabel = plugin.shadowedBy ? chalk.dim(" [shadowed]") : "";
			const scopeLabel = chalk.dim(` (${plugin.scope})`);
			console.log(`  ${plugin.id} (${version})${scopeLabel}${shadowLabel}`);
		}
	}
}

async function handleLink(
	manager: PluginManager,
	paths: string[],
	flags: { json?: boolean; dryRun?: boolean },
): Promise<void> {
	if (paths.length === 0) {
		console.error(chalk.red(`Usage: ${APP_NAME} plugin link <path>`));
		process.exit(1);
	}

	if (flags.dryRun) {
		printLinkPreview(paths[0], flags.json);
		return;
	}

	try {
		const result = await manager.link(paths[0]);

		if (flags.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(chalk.green(`${theme.status.success} Linked ${result.name} from ${paths[0]}`));
		}
	} catch (err) {
		console.error(chalk.red(`${theme.status.error} Failed to link: ${err}`));
		process.exit(1);
	}
}

async function handleDoctor(manager: PluginManager, flags: { json?: boolean; fix?: boolean }): Promise<void> {
	const checks = await manager.doctor({ fix: flags.fix });

	if (flags.json) {
		console.log(JSON.stringify(checks, null, 2));
		return;
	}

	console.log(chalk.bold("Plugin Health Check\n"));

	for (const check of checks) {
		const icon =
			check.status === "ok"
				? chalk.green(theme.status.success)
				: check.status === "warning"
					? chalk.yellow(theme.status.warning)
					: chalk.red(theme.status.error);
		console.log(`${icon} ${check.name}: ${check.message}`);
		if (check.fixed) {
			console.log(chalk.dim(`  ${theme.nav.cursor} Fixed`));
		}
	}

	const errors = checks.filter(c => c.status === "error" && !c.fixed).length;
	const warnings = checks.filter(c => c.status === "warning" && !c.fixed).length;
	const ok = checks.filter(c => c.status === "ok").length;
	const fixed = checks.filter(c => c.fixed).length;

	console.log("");
	console.log(`Summary: ${ok} ok, ${warnings} warnings, ${errors} errors${fixed > 0 ? `, ${fixed} fixed` : ""}`);

	if (errors > 0) {
		if (!flags.fix) {
			console.log(chalk.dim("\nRun with --fix to attempt automatic repair"));
		}
		process.exit(1);
	}
}

async function handleFeatures(
	manager: PluginManager,
	args: string[],
	flags: { json?: boolean; enable?: string; disable?: string; set?: string },
): Promise<void> {
	if (args.length === 0) {
		console.error(
			chalk.red(`Usage: ${APP_NAME} plugin features <plugin> [--enable f1,f2] [--disable f1] [--set f1,f2]`),
		);
		process.exit(1);
	}

	const pluginName = args[0];
	const plugin = await manager.getPlugin(pluginName, { path: path.join(getPluginsNodeModules(), pluginName) });

	if (!plugin) {
		console.error(chalk.red(`Plugin "${pluginName}" not found`));
		process.exit(1);
	}

	// Handle modifications
	if (flags.enable || flags.disable || flags.set) {
		let currentFeatures = new Set((await manager.getEnabledFeatures(pluginName)) ?? []);

		if (flags.set) {
			// --set replaces all features
			currentFeatures = new Set(
				flags.set
					.split(",")
					.map(f => f.trim())
					.filter(Boolean),
			);
		} else {
			if (flags.enable) {
				for (const f of flags.enable
					.split(",")
					.map(f => f.trim())
					.filter(Boolean)) {
					currentFeatures.add(f);
				}
			}
			if (flags.disable) {
				for (const f of flags.disable
					.split(",")
					.map(f => f.trim())
					.filter(Boolean)) {
					currentFeatures.delete(f);
				}
			}
		}

		await manager.setEnabledFeatures(pluginName, [...currentFeatures]);
		console.log(chalk.green(`${theme.status.success} Updated features for ${pluginName}`));
	}

	// Display current state
	const updatedFeatures = await manager.getEnabledFeatures(pluginName);

	if (flags.json) {
		console.log(
			JSON.stringify(
				{
					plugin: pluginName,
					enabledFeatures: updatedFeatures,
					availableFeatures: plugin.manifest.features ? Object.keys(plugin.manifest.features) : [],
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(chalk.bold(`Features for ${pluginName}:\n`));

	if (!plugin.manifest.features || Object.keys(plugin.manifest.features).length === 0) {
		console.log(chalk.dim("  No optional features available"));
		return;
	}

	const enabledSet = new Set(updatedFeatures ?? []);
	for (const [name, feat] of Object.entries(plugin.manifest.features)) {
		const enabled = enabledSet.has(name);
		const icon = enabled ? chalk.green(theme.status.enabled) : chalk.dim(theme.status.disabled);
		const defaultLabel = feat.default ? chalk.dim(" (default)") : "";
		console.log(`${icon} ${name}${defaultLabel}`);
		if (feat.description) {
			console.log(chalk.dim(`    ${feat.description}`));
		}
	}
}

async function handleConfig(
	manager: PluginManager,
	args: string[],
	flags: { json?: boolean; local?: boolean },
): Promise<void> {
	if (args.length === 0) {
		console.error(
			chalk.red(`Usage: ${APP_NAME} plugin config <list|get|set|delete|validate> <plugin> [key] [value]`),
		);
		process.exit(1);
	}

	const [subcommand, pluginName, key, ...valueArgs] = args;

	// Special case: validate doesn't need a plugin name
	if (subcommand === "validate") {
		await handleConfigValidate(manager, flags);
		return;
	}

	if (!pluginName) {
		console.error(chalk.red("Plugin name required"));
		process.exit(1);
	}

	const plugin = await manager.getPlugin(pluginName);

	if (!plugin) {
		console.error(chalk.red(`Plugin "${pluginName}" not found`));
		process.exit(1);
	}

	switch (subcommand) {
		case "list": {
			const settings = await manager.getPluginSettings(pluginName);
			const schema = plugin.manifest.settings || {};

			if (flags.json) {
				console.log(JSON.stringify({ settings, schema }, null, 2));
				return;
			}

			console.log(chalk.bold(`Settings for ${pluginName}:\n`));

			if (Object.keys(schema).length === 0) {
				console.log(chalk.dim("  No settings defined"));
				return;
			}

			for (const [k, s] of Object.entries(schema)) {
				const value = settings[k] ?? s.default;
				const displayValue = s.secret && value ? "********" : String(value ?? chalk.dim("(not set)"));
				console.log(`  ${k}: ${displayValue}`);
				if (s.description) {
					console.log(chalk.dim(`    ${s.description}`));
				}
				if (s.env) {
					console.log(chalk.dim(`    env: ${s.env}`));
				}
			}
			break;
		}

		case "get": {
			if (!key) {
				console.error(chalk.red("Key required"));
				process.exit(1);
			}

			const settings = await manager.getPluginSettings(pluginName);
			const schema = plugin.manifest.settings?.[key];
			const value = settings[key] ?? schema?.default;

			if (flags.json) {
				console.log(JSON.stringify({ [key]: value }));
			} else {
				const displayValue = schema?.secret && value ? "********" : String(value ?? "(not set)");
				console.log(displayValue);
			}
			break;
		}

		case "set": {
			if (!key) {
				console.error(chalk.red("Key required"));
				process.exit(1);
			}

			const valueStr = valueArgs.join(" ");
			const schema = plugin.manifest.settings?.[key];

			// Parse value according to type
			let value: unknown = valueStr;
			if (schema) {
				value = parseSettingValue(valueStr, schema);

				// Validate
				const validation = validateSetting(value, schema);
				if (!validation.valid) {
					console.error(chalk.red(validation.error!));
					process.exit(1);
				}
			}

			await manager.setPluginSetting(pluginName, key, value);
			console.log(chalk.green(`${theme.status.success} Set ${key}`));
			break;
		}

		case "delete": {
			if (!key) {
				console.error(chalk.red("Key required"));
				process.exit(1);
			}

			await manager.deletePluginSetting(pluginName, key);
			console.log(chalk.green(`${theme.status.success} Deleted ${key}`));
			break;
		}

		default:
			console.error(chalk.red(`Unknown config subcommand: ${subcommand}`));
			console.error(chalk.dim("Valid subcommands: list, get, set, delete, validate"));
			process.exit(1);
	}
}

/**
 * Enumerate every installed plugin to validate — npm/link plugins from
 * {@link PluginManager.list} plus marketplace runtime packages, which `list()`
 * intentionally omits. Marketplace summaries are resolved through their trusted
 * install path; deduped by resolved package name using the same active-scope
 * precedence as runtime loading.
 */
async function collectPluginsForValidation(manager: PluginManager): Promise<InstalledPlugin[]> {
	const byName = new Map<string, InstalledPlugin>();
	for (const plugin of await manager.list()) {
		byName.set(plugin.name, plugin);
	}
	const installedManager = await makeInstalledPluginManager();
	for (const summary of await installedManager.listInstalledPlugins()) {
		const entry = summary.entries[0];
		if (!entry) continue;
		const fallbackName = parsePluginId(summary.id)?.name ?? summary.id;
		const resolved = await manager.getPlugin(fallbackName, { path: entry.installPath });
		if (!resolved) continue;
		byName.set(resolved.name, (await manager.getPlugin(resolved.name)) ?? resolved);
	}
	return [...byName.values()];
}

async function handleConfigValidate(manager: PluginManager, flags: { json?: boolean }): Promise<void> {
	const plugins = await collectPluginsForValidation(manager);
	const results: Array<{ plugin: string; key: string; error: string }> = [];

	for (const plugin of plugins) {
		const settings = await manager.getPluginSettings(plugin.name);
		const schema = plugin.manifest.settings || {};

		for (const [key, s] of Object.entries(schema)) {
			const value = settings[key];
			if (value !== undefined) {
				const validation = validateSetting(value, s);
				if (!validation.valid) {
					results.push({ plugin: plugin.name, key, error: validation.error! });
				}
			}
		}
	}

	if (flags.json) {
		console.log(JSON.stringify({ valid: results.length === 0, errors: results }, null, 2));
		return;
	}

	if (results.length === 0) {
		console.log(chalk.green(`${theme.status.success} All settings valid`));
	} else {
		for (const { plugin, key, error } of results) {
			console.log(chalk.red(`${theme.status.error} ${plugin}.${key}: ${error}`));
		}
		process.exit(1);
	}
}

async function handleEnable(
	manager: PluginManager,
	plugins: string[],
	flags: { json?: boolean; scope?: "user" | "project" },
): Promise<void> {
	return handleSetEnabled(manager, plugins, flags, true);
}

async function handleDisable(
	manager: PluginManager,
	plugins: string[],
	flags: { json?: boolean; scope?: "user" | "project" },
): Promise<void> {
	return handleSetEnabled(manager, plugins, flags, false);
}

async function handleSetEnabled(
	manager: PluginManager,
	plugins: string[],
	flags: { json?: boolean; scope?: "user" | "project" },
	enabled: boolean,
): Promise<void> {
	const action = enabled ? "enable" : "disable";
	const pastTense = enabled ? "Enabled" : "Disabled";
	const jsonKey = enabled ? "enabled" : "disabled";

	if (plugins.length === 0) {
		console.error(chalk.red(`Usage: ${APP_NAME} plugin ${action} <plugin> ...`));
		process.exit(1);
	}

	const installedManager = await makeInstalledPluginManager();
	const installedPlugins = new Set((await installedManager.listInstalledPlugins()).map(p => p.id));

	for (const name of plugins) {
		if (installedPlugins.has(name)) {
			try {
				await installedManager.setPluginEnabled(name, enabled, flags.scope);
				if (flags.json) {
					console.log(JSON.stringify({ [jsonKey]: name }));
				} else {
					console.log(chalk.green(`${theme.status.success} ${pastTense} ${name}`));
				}
			} catch (err) {
				console.error(chalk.red(`${theme.status.error} Failed to ${action} ${name}: ${err}`));
				process.exit(1);
			}
			continue;
		}

		try {
			await manager.setEnabled(name, enabled);
			if (flags.json) {
				console.log(JSON.stringify({ [jsonKey]: name }));
			} else {
				console.log(chalk.green(`${theme.status.success} ${pastTense} ${name}`));
			}
		} catch (err) {
			console.error(chalk.red(`${theme.status.error} Failed to ${action} ${name}: ${err}`));
			process.exit(1);
		}
	}
}

// =============================================================================
// Help
// =============================================================================

export function printPluginHelp(): void {
	console.log(
		t("cli.plugin.help", {
			title: chalk.bold(`${APP_NAME} plugin`),
			headingCommands: chalk.bold(t("cli.help.heading.commands")),
			headingFeatureSyntax: chalk.bold(t("cli.help.heading.featureSyntax")),
			headingSources: chalk.bold(t("cli.help.heading.sources")),
			headingConfigSubcommands: chalk.bold(t("cli.help.heading.configSubcommands")),
			headingOptions: chalk.bold(t("cli.help.heading.options")),
			headingExamples: chalk.bold(t("cli.help.heading.examples")),
			app: APP_NAME,
		}),
	);
}
