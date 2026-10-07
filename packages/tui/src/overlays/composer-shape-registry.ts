import { t } from "@oh-my-pi/pi-i18n";
import { type ComposerStyle, registerComposerStyle } from "../index";
import type { SubmenuOption } from "./settings-defs";

/** Composer shape id; extensions may register additional values at runtime. */
export type ComposerShape = string;

/**
 * Built-in composer choices and their shared settings/setup copy. Labels and
 * descriptions are display copy: the setup wizard and the settings submenu
 * render them, so they resolve lazily through `t()` (this module loads before
 * the UI language is initialized).
 */
const BUILTIN_COMPOSER_SHAPE_COPY = [
	{ value: "band", label: "tui.composerShape.band.label", description: "tui.composerShape.band.description" },
	{ value: "box", label: "tui.composerShape.box.label", description: "tui.composerShape.box.description" },
	{
		value: "claude",
		label: "tui.composerShape.claude.label",
		description: "tui.composerShape.claude.description",
	},
	{ value: "pi", label: "tui.composerShape.pi.label", description: "tui.composerShape.pi.description" },
	{
		value: "borderless",
		label: "tui.composerShape.borderless.label",
		description: "tui.composerShape.borderless.description",
	},
	{ value: "rule", label: "tui.composerShape.rule.label", description: "tui.composerShape.rule.description" },
	{ value: "field", label: "tui.composerShape.field.label", description: "tui.composerShape.field.description" },
	{ value: "rail", label: "tui.composerShape.rail.label", description: "tui.composerShape.rail.description" },
] as const;

/** Built-in composer choices with localized display copy, resolved on access. */
export const BUILTIN_COMPOSER_SHAPES: readonly SubmenuOption[] = BUILTIN_COMPOSER_SHAPE_COPY.map(copy => ({
	get label() {
		return t(copy.label);
	},
	get description() {
		return t(copy.description);
	},
	value: copy.value,
}));

/** Built-in composer ids used by tests and non-runtime consumers. */
export const COMPOSER_SHAPE_VALUES = BUILTIN_COMPOSER_SHAPES.map(shape => shape.value);

/** Visual composer style and selector copy registered by an extension. */
export interface ComposerShapeDefinition {
	label: string;
	description?: string;
	style: ComposerStyle;
}

const extensionComposerShapes = new Map<string, SubmenuOption>();

/** Install one extension composer shape into rendering and selector registries. */
export function installExtensionComposerShape(definition: ComposerShapeDefinition): () => void {
	const unregisterStyle = registerComposerStyle(definition.style);
	const id = definition.style.id;
	const option: SubmenuOption = {
		value: id,
		label: definition.label,
		description: definition.description,
	};
	extensionComposerShapes.set(id, option);
	return () => {
		if (extensionComposerShapes.get(id) === option) extensionComposerShapes.delete(id);
		unregisterStyle();
	};
}

/** Available built-in and extension composer choices in selector order. */
export function getComposerShapeOptions(): readonly SubmenuOption[] {
	return [...BUILTIN_COMPOSER_SHAPES, ...extensionComposerShapes.values()];
}
