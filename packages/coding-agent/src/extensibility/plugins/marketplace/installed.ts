/**
 * Local management of registry-installed plugins.
 *
 * Reads/writes the installed-plugins registries and the runtime lock/config so
 * the plugin list, settings overlay, and uninstall flow keep working for plugins
 * that were installed from a marketplace before that registry was removed. No
 * network access or catalog fetching happens here.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { isEnoent, logger } from "@oh-my-pi/pi-utils";
import { normalizePluginRuntimeConfig } from "../runtime-config";
import type { PluginRuntimeConfig } from "../types";
import {
	collectReferencedPaths,
	getInstalledPlugin,
	readInstalledPluginsRegistry,
	removeInstalledPlugin,
	writeInstalledPluginsRegistry,
} from "./registry";
import type { InstalledPluginEntry, InstalledPluginSummary, InstalledPluginsRegistry } from "./types";
import { parsePluginId } from "./types";

const RUNTIME_PACKAGE_NAME_RE = /^(?:@[a-zA-Z0-9][a-zA-Z0-9._~-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._~-]*$/;

function assertRuntimePackageName(name: string): string {
	if (!RUNTIME_PACKAGE_NAME_RE.test(name)) {
		throw new Error(`Invalid plugin package name: ${JSON.stringify(name)}`);
	}
	return name;
}

export interface InstalledPluginManagerOptions {
	installedRegistryPath: string;
	projectInstalledRegistryPath?: string;
}

/** Registry metadata for plugins installed from a marketplace, plus local enable/remove operations. */
export class InstalledPluginManager {
	readonly #opts: InstalledPluginManagerOptions;

	constructor(opts: InstalledPluginManagerOptions) {
		this.#opts = opts;
	}

	async listInstalledPlugins(): Promise<InstalledPluginSummary[]> {
		const userReg = await readInstalledPluginsRegistry(this.#opts.installedRegistryPath);
		const projectReg = this.#opts.projectInstalledRegistryPath
			? await readInstalledPluginsRegistry(this.#opts.projectInstalledRegistryPath)
			: null;

		// Only enabled project installs shadow user installs — a disabled project copy leaves
		// the user entry as the active one and must not be reported as shadowed.
		const activeProjectIds = new Set(
			projectReg
				? Object.entries(projectReg.plugins)
						.filter(([, entries]) => entries.length > 0 && entries[0].enabled !== false)
						.map(([id]) => id)
				: [],
		);
		const results: InstalledPluginSummary[] = [];

		if (projectReg) {
			for (const [id, entries] of Object.entries(projectReg.plugins)) {
				results.push({ id, scope: "project", entries });
			}
		}
		for (const [id, entries] of Object.entries(userReg.plugins)) {
			results.push({
				id,
				scope: "user",
				entries,
				...(activeProjectIds.has(id) ? { shadowedBy: "project" as const } : {}),
			});
		}
		return results;
	}

	async setPluginEnabled(pluginId: string, enabled: boolean, scope?: "user" | "project"): Promise<void> {
		const { userReg, projectReg, userEntries, projectEntries, targetScope } = await this.#resolveScope(
			pluginId,
			scope,
		);
		const entries = targetScope === "project" ? projectEntries : userEntries;
		const reg = targetScope === "project" ? projectReg : userReg;

		const updated: InstalledPluginsRegistry = {
			...reg,
			plugins: {
				...reg.plugins,
				[pluginId]: entries.map(entry => ({ ...entry, enabled })),
			},
		};
		await writeInstalledPluginsRegistry(this.#registryPath(targetScope), updated);

		const fallbackName = parsePluginId(pluginId)?.name ?? pluginId;
		const runtime = await this.#loadRuntimeConfig(targetScope);
		let changed = false;
		for (const entry of entries) {
			const packageName = await this.#resolvePluginPackageName(entry.installPath, fallbackName);
			const previous = runtime.plugins[packageName];
			if (!previous) continue;
			runtime.plugins[packageName] = { ...previous, enabled };
			changed = true;
		}
		if (changed) await this.#writeRuntimeConfig(targetScope, runtime);

		logger.debug("Plugin enabled state changed", { pluginId, enabled, scope: targetScope });
	}

	/** Removes a registry-installed plugin's metadata, runtime link, and unreferenced cache directory. */
	async uninstallPlugin(pluginId: string, scope?: "user" | "project"): Promise<void> {
		const { userReg, projectReg, targetScope, entries } = await this.#resolveScope(pluginId, scope);
		const reg = targetScope === "project" ? projectReg : userReg;
		const registryPath = this.#registryPath(targetScope);
		const fallbackName = parsePluginId(pluginId)?.name ?? pluginId;
		const packageNames = new Set<string>();
		for (const entry of entries) {
			packageNames.add(await this.#resolvePluginPackageName(entry.installPath, fallbackName));
		}

		await writeInstalledPluginsRegistry(registryPath, removeInstalledPlugin(reg, pluginId));

		// Read both registries AFTER removal — only delete paths no longer referenced by either.
		const [freshUserReg, freshProjectReg] = await Promise.all([
			readInstalledPluginsRegistry(this.#opts.installedRegistryPath),
			this.#opts.projectInstalledRegistryPath
				? readInstalledPluginsRegistry(this.#opts.projectInstalledRegistryPath)
				: Promise.resolve({ version: 2 as const, plugins: {} as Record<string, InstalledPluginEntry[]> }),
		]);
		const referenced = collectReferencedPaths(freshUserReg, freshProjectReg);
		for (const entry of entries) {
			if (!referenced.has(entry.installPath)) {
				await fs.rm(entry.installPath, { recursive: true, force: true });
			}
		}

		const nodeModules = path.join(path.dirname(registryPath), "node_modules");
		for (const packageName of packageNames) {
			await fs.rm(path.join(nodeModules, assertRuntimePackageName(packageName)), {
				recursive: true,
				force: true,
			});
		}

		const runtime = await this.#loadRuntimeConfig(targetScope);
		for (const packageName of packageNames) {
			delete runtime.plugins[packageName];
			delete runtime.settings[packageName];
		}
		await this.#writeRuntimeConfig(targetScope, runtime);

		logger.debug("Plugin uninstalled", { pluginId, scope: targetScope });
	}

	#registryPath(scope: "user" | "project"): string {
		if (scope === "project") {
			if (!this.#opts.projectInstalledRegistryPath) {
				throw new Error("project-scoped install requires running inside a project directory");
			}
			return this.#opts.projectInstalledRegistryPath;
		}
		return this.#opts.installedRegistryPath;
	}

	async #resolveScope(
		pluginId: string,
		scope?: "user" | "project",
	): Promise<{
		userReg: InstalledPluginsRegistry;
		projectReg: InstalledPluginsRegistry;
		userEntries: InstalledPluginEntry[];
		projectEntries: InstalledPluginEntry[];
		targetScope: "user" | "project";
		entries: InstalledPluginEntry[];
	}> {
		if (!parsePluginId(pluginId)) {
			throw new Error(`Invalid plugin ID format: "${pluginId}". Expected "name@marketplace".`);
		}
		const [userReg, projectReg] = await Promise.all([
			readInstalledPluginsRegistry(this.#opts.installedRegistryPath),
			this.#opts.projectInstalledRegistryPath
				? readInstalledPluginsRegistry(this.#opts.projectInstalledRegistryPath)
				: Promise.resolve({ version: 2 as const, plugins: {} as Record<string, InstalledPluginEntry[]> }),
		]);
		const userEntries = getInstalledPlugin(userReg, pluginId) ?? [];
		const projectEntries = getInstalledPlugin(projectReg, pluginId) ?? [];
		const inUser = userEntries.length > 0;
		const inProject = projectEntries.length > 0;
		if (!inUser && !inProject) {
			throw new Error(`Plugin "${pluginId}" is not installed`);
		}

		let targetScope: "user" | "project";
		if (inUser && inProject) {
			if (!scope) {
				throw new Error(
					`Plugin "${pluginId}" is installed in both user and project scope. Use --scope user or --scope project to specify which to modify.`,
				);
			}
			targetScope = scope;
		} else if (inProject) {
			if (scope === "user") throw new Error(`Plugin "${pluginId}" is not installed in user scope`);
			targetScope = "project";
		} else {
			if (scope === "project") throw new Error(`Plugin "${pluginId}" is not installed in project scope`);
			targetScope = "user";
		}
		return {
			userReg,
			projectReg,
			userEntries,
			projectEntries,
			targetScope,
			entries: targetScope === "project" ? projectEntries : userEntries,
		};
	}

	async #resolvePluginPackageName(installPath: string, fallbackName: string): Promise<string> {
		try {
			const pkg: { name?: unknown } = await Bun.file(path.join(installPath, "package.json")).json();
			const name = typeof pkg.name === "string" && pkg.name.length > 0 ? pkg.name : fallbackName;
			return assertRuntimePackageName(name);
		} catch (err) {
			if (isEnoent(err)) return assertRuntimePackageName(fallbackName);
			throw err;
		}
	}

	#runtimeLockPath(scope: "user" | "project"): string {
		return path.join(path.dirname(this.#registryPath(scope)), "omp-plugins.lock.json");
	}

	async #loadRuntimeConfig(scope: "user" | "project"): Promise<PluginRuntimeConfig> {
		try {
			return normalizePluginRuntimeConfig(await Bun.file(this.#runtimeLockPath(scope)).json());
		} catch (err) {
			if (isEnoent(err)) return normalizePluginRuntimeConfig({});
			logger.warn("Failed to load plugin runtime config", {
				path: this.#runtimeLockPath(scope),
				error: String(err),
			});
			return normalizePluginRuntimeConfig({});
		}
	}

	async #writeRuntimeConfig(scope: "user" | "project", config: PluginRuntimeConfig): Promise<void> {
		await Bun.write(this.#runtimeLockPath(scope), JSON.stringify(config, null, 2));
	}
}
