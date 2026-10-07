import type { MemoryBackend } from "./types";
import { t } from "@oh-my-pi/pi-i18n";

/**
 * No-op memory backend.
 *
 * Selected when `memory.backend` is `"off"`.
 */
export const offBackend: MemoryBackend = {
	id: "off",
	async start() {},
	async buildDeveloperInstructions() {
		return undefined;
	},
	async clear() {},
	async enqueue() {},
	async status() {
		return {
			backend: "off" as const,
			active: false,
			writable: false,
			searchable: false,
			message: t("tui.ca.memoryBackend.offBackend.memoryBackendIsOff"),
		};
	},
};
