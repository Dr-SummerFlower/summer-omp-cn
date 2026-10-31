import type { PluginSettingsHost } from "@oh-my-pi/pi-tui/overlays/plugin-settings";
import { resolveOrDefaultProjectRegistryPath } from "../../discovery/helpers";
import { PluginManager } from "./manager";
import { getInstalledPluginsRegistryPath, InstalledPluginManager, parsePluginId } from "./marketplace";

/** Creates host-owned plugin managers for the settings overlay. */
export function createPluginSettingsHost(cwd: string): PluginSettingsHost {
	return {
		manager: new PluginManager(cwd),
		async createMarketplaceManager() {
			return new InstalledPluginManager({
				installedRegistryPath: getInstalledPluginsRegistryPath(),
				projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(cwd),
			});
		},
		parsePluginId,
	};
}
