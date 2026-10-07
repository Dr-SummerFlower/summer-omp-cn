/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";
import { DEFAULT_SHARE_URL } from "@oh-my-pi/pi-wire";
import { t } from "@oh-my-pi/pi-i18n";

export const cfgShareServerUrl = register({
	id: "share.serverUrl",
	type: "string",
	default: DEFAULT_SHARE_URL,
	ui: {
		tab: "interaction",
		group: "Collab",
		label: t("settings.item.share.serverUrl.label"),
		description: t("settings.item.share.serverUrl.description"),
	},
});

export const cfgShareStore = register({
	id: "share.store",
	type: "enum",
	values: ["blob", "gist"] as const,
	default: "blob",
	ui: {
		tab: "interaction",
		group: "Collab",
		label: t("settings.item.share.store.label"),
		description: t("settings.item.share.store.description"),
		options: [
			{
				value: "blob",
				label: t("settings.item.share.store.option.blob.label"),
				description: t("settings.item.share.store.option.blob.description"),
			},
			{
				value: "gist",
				label: t("settings.item.share.store.option.gist.label"),
				description: t("settings.item.share.store.option.gist.description"),
			},
		],
	},
});

export const cfgShareRedactSecrets = register({
	id: "share.redactSecrets",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "Collab",
		label: t("settings.item.share.redactSecrets.label"),
		description: t("settings.item.share.redactSecrets.description"),
	},
});
