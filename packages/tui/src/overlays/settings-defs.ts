/** Schema-independent display definitions for the settings overlay. */
import { t } from "@oh-my-pi/pi-i18n";
import type { SymbolKey } from "../theme/symbols";

export type SettingTab =
	| "appearance"
	| "model"
	| "interaction"
	| "context"
	| "memory"
	| "files"
	| "shell"
	| "tools"
	| "tasks"
	| "providers";

/** Tab display metadata - icon is resolved via theme.symbol() */
export type TabMetadata = { label: string; icon: Extract<SymbolKey, `tab.${string}`> };

/** Ordered list of tabs for UI rendering */
export const SETTING_TABS: SettingTab[] = [
	"appearance",
	"model",
	"interaction",
	"context",
	"memory",
	"files",
	"shell",
	"tools",
	"tasks",
	"providers",
];

/**
 * Tab display metadata - icon is a symbol key from theme.ts (tab.*).
 * Labels are getters: this module loads before the UI language is initialized,
 * so translating eagerly would freeze the language.
 */
export const TAB_METADATA: Record<SettingTab, TabMetadata> = {
	appearance: {
		get label() {
			return t("tui.settings.tabLabel.appearance");
		},
		icon: "tab.appearance",
	},
	model: {
		get label() {
			return t("tui.settings.tabLabel.model");
		},
		icon: "tab.model",
	},
	interaction: {
		get label() {
			return t("tui.settings.tabLabel.interaction");
		},
		icon: "tab.interaction",
	},
	context: {
		get label() {
			return t("tui.settings.tabLabel.context");
		},
		icon: "tab.context",
	},
	memory: {
		get label() {
			return t("tui.settings.tabLabel.memory");
		},
		icon: "tab.memory",
	},
	files: {
		get label() {
			return t("tui.settings.tabLabel.files");
		},
		icon: "tab.files",
	},
	shell: {
		get label() {
			return t("tui.settings.tabLabel.shell");
		},
		icon: "tab.shell",
	},
	tools: {
		get label() {
			return t("tui.settings.tabLabel.tools");
		},
		icon: "tab.tools",
	},
	tasks: {
		get label() {
			return t("tui.settings.tabLabel.tasks");
		},
		icon: "tab.tasks",
	},
	providers: {
		get label() {
			return t("tui.settings.tabLabel.providers");
		},
		icon: "tab.providers",
	},
};

/** One-sentence lead per tab, under the page title of the native settings page. */
export const TAB_LEADS: Record<SettingTab, string> = {
	get appearance() {
		return t("tui.settings.tabLead.appearance");
	},
	get model() {
		return t("tui.settings.tabLead.model");
	},
	get interaction() {
		return t("tui.settings.tabLead.interaction");
	},
	get context() {
		return t("tui.settings.tabLead.context");
	},
	get memory() {
		return t("tui.settings.tabLead.memory");
	},
	get files() {
		return t("tui.settings.tabLead.files");
	},
	get shell() {
		return t("tui.settings.tabLead.shell");
	},
	get tools() {
		return t("tui.settings.tabLead.tools");
	},
	get tasks() {
		return t("tui.settings.tabLead.tasks");
	},
	get providers() {
		return t("tui.settings.tabLead.providers");
	},
};

/**
 * Ordered section groups per tab. Settings declare their section via `ui.group`;
 * the settings UI renders groups in this order with a heading row between them.
 * Ungrouped settings render first, before any section heading.
 *
 * These names are the *matching keys*: host settings carry the same English
 * `ui.group`, and ordering compares against them verbatim. They must stay
 * untranslated — use `groupLabel()` for display.
 */
export const TAB_GROUPS: Record<SettingTab, readonly string[]> = {
	appearance: ["Theme", "Composer", t("tui.overlays.settingsDefs.statusLine"), "Display", "Images"],
	model: ["Thinking", "Sampling", "Prompt", t("tui.overlays.settingsDefs.retryFallback"), "Vision"],
	interaction: [
		"Input",
		"Approvals",
		"Notifications",
		"Stream",
		"Share",
		t("tui.overlays.settingsDefs.magicKeywords"),
		t("tui.overlays.settingsDefs.startupUpdates"),
		"Power",
		"Agent",
		"Git",
		"Skills",
	],
	context: ["General", "Compaction", t("tui.overlays.settingsDefs.rulesTtsr"), "Experimental"],
	memory: ["General", t("tui.overlays.settingsDefs.autoLearn"), "Mnemopi", "Sharpshooter"],
	files: ["Editing", "Reading", t("tui.overlays.settingsDefs.readSummaries"), "LSP"],
	shell: ["Bash", t("tui.overlays.settingsDefs.evalRuntimes")],
	tools: [
		t("tui.overlays.settingsDefs.availableTools"),
		"Todos",
		t("tui.overlays.settingsDefs.grepBrowser"),
		"IDA Pro",
		"GitHub",
		t("tui.overlays.settingsDefs.outputLimits"),
		"Execution",
		t("tui.overlays.settingsDefs.discoveryMcp"),
		"Extensions",
		"Developer",
	],
	tasks: ["Modes", "Subagents", "Isolation", t("tui.overlays.settingsDefs.commandsSkills")],
	providers: ["Services", "Fireworks", t("tui.overlays.settingsDefs.tinyModel"), "Protocol", "Timeouts", "Privacy"],
};

/**
 * Display labels for section groups, keyed by the English names declared in
 * `TAB_GROUPS`. Lazily evaluated for the same reason as `TAB_METADATA`.
 */
const GROUP_LABELS: Record<string, () => string> = {
	Theme: () => t("tui.settings.group.theme"),
	Composer: () => t("tui.settings.group.composer"),
	"Status Line": () => t("tui.settings.group.statusLine"),
	Display: () => t("tui.settings.group.display"),
	Images: () => t("tui.settings.group.images"),
	Thinking: () => t("tui.settings.group.thinking"),
	Sampling: () => t("tui.settings.group.sampling"),
	Prompt: () => t("tui.settings.group.prompt"),
	"Retry & Fallback": () => t("tui.settings.group.retryFallback"),
	Vision: () => t("tui.settings.group.vision"),
	Input: () => t("tui.settings.group.input"),
	Approvals: () => t("tui.settings.group.approvals"),
	Notifications: () => t("tui.settings.group.notifications"),
	Stream: () => t("tui.settings.group.stream"),
	Share: () => "Share",
	"Magic Keywords": () => t("tui.settings.group.magicKeywords"),
	"Startup & Updates": () => t("tui.settings.group.startupUpdates"),
	Power: () => t("tui.settings.group.power"),
	Agent: () => t("tui.settings.group.agent"),
	Git: () => t("tui.settings.group.git"),
	Skills: () => t("tui.settings.group.skills"),
	General: () => t("tui.settings.group.general"),
	Compaction: () => t("tui.settings.group.compaction"),
	"Rules (TTSR)": () => t("tui.settings.group.rulesTtsr"),
	Experimental: () => t("tui.settings.group.experimental"),
	"Auto-Learn": () => t("tui.settings.group.autoLearn"),
	Mnemopi: () => t("tui.settings.group.mnemopi"),
	Sharpshooter: () => t("tui.settings.group.sharpshooter"),
	Editing: () => t("tui.settings.group.editing"),
	Reading: () => t("tui.settings.group.reading"),
	"Read Summaries": () => t("tui.settings.group.readSummaries"),
	LSP: () => t("tui.settings.group.lsp"),
	Bash: () => t("tui.settings.group.bash"),
	"Eval & Runtimes": () => t("tui.settings.group.evalRuntimes"),
	"Available Tools": () => t("tui.settings.group.availableTools"),
	Todos: () => t("tui.settings.group.todos"),
	"Grep & Browser": () => t("tui.settings.group.grepBrowser"),
	"IDA Pro": () => t("tui.settings.group.idaPro"),
	GitHub: () => t("tui.settings.group.github"),
	"Output Limits": () => t("tui.settings.group.outputLimits"),
	Execution: () => t("tui.settings.group.execution"),
	"Discovery & MCP": () => t("tui.settings.group.discoveryMcp"),
	Extensions: () => t("tui.settings.group.extensions"),
	Developer: () => t("tui.settings.group.developer"),
	Modes: () => t("tui.settings.group.modes"),
	Subagents: () => t("tui.settings.group.subagents"),
	Isolation: () => t("tui.settings.group.isolation"),
	"Commands & Skills": () => t("tui.settings.group.commandsSkills"),
	Services: () => t("tui.settings.group.services"),
	Fireworks: () => t("tui.settings.group.fireworks"),
	"Tiny Model": () => t("tui.settings.group.tinyModel"),
	Protocol: () => t("tui.settings.group.protocol"),
	Timeouts: () => t("tui.settings.group.timeouts"),
	Privacy: () => t("tui.settings.group.privacy"),
};

/**
 * Display label for a section group. A group the host declares but `TAB_GROUPS`
 * does not list renders as declared.
 */
export function groupLabel(group: string): string {
	return GROUP_LABELS[group]?.() ?? group;
}

/** Submenu choice metadata. */
export type SubmenuOption<V extends string = string> = {
	value: V;
	label: string;
	description?: string;
};

export interface UiBase {
	tab: SettingTab;
	/** Section within the tab; must be listed in TAB_GROUPS[tab]. Ungrouped settings render at the top. */
	group?: string;
	label: string;
	description: string;
	/**
	 * Risk note. Marks the settings row with a warning glyph and renders above
	 * the description in warning styling. For settings that can get the user
	 * rate-limited, flagged, or banned — not for merely advanced options.
	 */
	warning?: string;
	/** Condition function name - setting only shown when true */
	condition?: string;
}

/** Wide ui shape exposed to consumers that walk the schema generically. */
export type AnyUiMetadata = UiBase & {
	options?: ReadonlyArray<SubmenuOption> | "runtime";
	secret?: boolean;
	ordered?: boolean;
};

/** Structural schema entries supplied by the application host. */
export interface SettingsDisplayEntry {
	path: string;
	type: string;
	defaultValue: unknown;
	ui?: AnyUiMetadata;
	enumValues?: readonly string[];
	credential?: boolean;
	condition?: () => boolean;
}

export interface SettingsHost {
	entries: readonly SettingsDisplayEntry[];
	get(path: string): unknown;
	set(path: string, value: unknown): void;
	/**
	 * Removes the value from the global config: a project or other layer, or an environment
	 * variable, that configures the setting still applies; otherwise the default does.
	 */
	unset(path: string): void;
	normalizeProviderLimits(value: unknown): Record<string, number>;
	validateProviderLimits(value: unknown): Record<string, number>;
}

/** Primitive value displayed by a settings control. */
export type SettingsDisplayValue = boolean | string;

interface BaseSettingDef {
	path: string;
	defaultValue: unknown;
	schemaType: string;
	label: string;
	description: string;
	/** Risk note shown in warning styling; set for settings that can get the user flagged or banned. */
	warning?: string;
	tab: SettingTab;
	/** Section within the tab; items are ordered by TAB_GROUPS[tab] and rendered under a heading row. */
	group?: string;
	/**
	 * Optional visibility predicate. When supplied and returning false, the
	 * setting is hidden from the UI. Applies to every variant — booleans,
	 * enums, submenus, and text inputs.
	 */
	condition?: () => boolean;
}

export interface BooleanSettingDef extends BaseSettingDef {
	type: "boolean";
}

export interface EnumSettingDef extends BaseSettingDef {
	type: "enum";
	values: readonly string[];
}

type OptionList = ReadonlyArray<SubmenuOption>;

export interface SubmenuSettingDef extends BaseSettingDef {
	type: "submenu";
	options: OptionList;
	onPreview?: (value: string) => void;
	onPreviewCancel?: (originalValue: string) => void;
}

export interface TextInputSettingDef extends BaseSettingDef {
	type: "text";
	secret: boolean;
}

export interface ProviderLimitsSettingDef extends BaseSettingDef {
	type: "providerLimits";
}

/** Array-of-enum setting edited as a toggle list; `ordered` lists render positions and support reordering. */
export interface MultiSelectSettingDef extends BaseSettingDef {
	type: "multiselect";
	options: OptionList;
	ordered: boolean;
}

export type SettingDef =
	| BooleanSettingDef
	| EnumSettingDef
	| SubmenuSettingDef
	| TextInputSettingDef
	| ProviderLimitsSettingDef
	| MultiSelectSettingDef;

function resolveOptions(ui: AnyUiMetadata): OptionList | "runtime" | undefined {
	if (!ui.options) return undefined;
	if (ui.options === "runtime") return "runtime";
	return ui.options;
}

function entryToSettingDef(entry: SettingsDisplayEntry): SettingDef | null {
	const { path, ui } = entry;
	if (!ui) return null;

	const schemaType = entry.type;
	const condition = entry.condition;
	const base = {
		path,
		defaultValue: entry.defaultValue,
		schemaType,
		label: ui.label,
		description: ui.description,
		warning: ui.warning,
		tab: ui.tab,
		group: ui.group,
		condition,
	};

	if (schemaType === "boolean") {
		return { ...base, type: "boolean" };
	}

	const options = resolveOptions(ui);

	if (schemaType === "enum") {
		if (options === undefined) {
			return { ...base, type: "enum", values: entry.enumValues ?? [] };
		}
		// "runtime" is not a valid sentinel for enums — schema types prevent this,
		// but treat defensively as an empty submenu.
		return { ...base, type: "submenu", options: options === "runtime" ? [] : options };
	}

	if (schemaType === "number") {
		// Numbers without options are intentionally hidden from the UI.
		if (!options || options === "runtime") return null;
		return { ...base, type: "submenu", options };
	}

	if (schemaType === "string") {
		if (options === "runtime") {
			// Empty list now; the selector layer (theme handling, etc.) injects choices.
			return { ...base, type: "submenu", options: [] };
		}
		if (options) {
			return { ...base, type: "submenu", options };
		}
		// One classification drives both surfaces: a setting marked `credential`
		// masks here too, so the panel cannot display one that only the CLI knows
		// to redact.
		return { ...base, type: "text", secret: entry.credential === true };
	}

	if (schemaType === "array") {
		// Arrays without declared options stay config-file only (free-form lists
		// like extension paths have no finite choice set to toggle).
		if (!options || options === "runtime") return null;
		return { ...base, type: "multiselect", options, ordered: ui.ordered === true };
	}

	if (schemaType === "record") {
		return path === "providers.maxInFlightRequests"
			? { ...base, type: "providerLimits" }
			: { ...base, type: "text", secret: false };
	}

	return null;
}

const definitions = new WeakMap<readonly SettingsDisplayEntry[], SettingDef[]>();

/** Get all setting definitions with UI, retaining live host visibility predicates. */
export function getAllSettingDefs(entries: readonly SettingsDisplayEntry[]): SettingDef[] {
	let defs = definitions.get(entries);
	if (!defs) {
		defs = [];
		for (const entry of entries) {
			const def = entryToSettingDef(entry);
			if (def) defs.push(def);
		}
		definitions.set(entries, defs);
	}
	return defs;
}

/** Get settings ordered by their tab's section layout. */
export function getSettingsForTab(entries: readonly SettingsDisplayEntry[], tab: SettingTab): SettingDef[] {
	const defs = getAllSettingDefs(entries).filter(def => def.tab === tab);
	const order = TAB_GROUPS[tab];
	const rank = (def: SettingDef): number => {
		if (!def.group) return -1;
		const index = order.indexOf(def.group);
		return index >= 0 ? index : order.length;
	};
	return defs.sort((a, b) => rank(a) - rank(b));
}

/** Find the display definition for a host setting path. */
export function getSettingDef(entries: readonly SettingsDisplayEntry[], path: string): SettingDef | undefined {
	return getAllSettingDefs(entries).find(def => def.path === path);
}

/**
 * The numeric value a number-like choice option stands for: its number, or
 * -1 for `default` (the stored sentinel, see the selector's value mapping);
 * `undefined` when the option is not numeric.
 */
export function numericOption(value: string): number | undefined {
	if (value === "default") return -1;
	const n = Number(value);
	return value.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

/**
 * Number hint: a numeric setting whose choices are all numbers (or the
 * `default` sentinel) edits as a stepper through those values on a native
 * settings page. Returns the steps (number → label), else `undefined`.
 */
export function numberSteps(def: SettingDef): Record<string, string> | undefined {
	if (def.schemaType !== "number" || def.type !== "submenu" || def.options.length < 2) return undefined;
	const labels: Record<string, string> = {};
	for (const option of def.options) {
		const n = numericOption(option.value);
		if (n === undefined) return undefined;
		labels[String(n)] = option.label;
	}
	return labels;
}

/** Format a setting's declared default for display. */
export function getDisplayDefault(entries: readonly SettingsDisplayEntry[], path: string): string {
	const value = entries.find(entry => entry.path === path)?.defaultValue;
	if (value === undefined) return "";
	if (typeof value === "boolean") return value ? "true" : "false";
	return String(value);
}
