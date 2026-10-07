/**
 * Render every built-in tool's renderer across its lifecycle states.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { galleryHelp as commandHelp } from "../cli/command-help";
import {
	GALLERY_STATE_TOKENS,
	GALLERY_SURFACE_TOKENS,
	type GalleryState,
	type GallerySurface,
	parseGalleryStates,
	parseGallerySurfaces,
	runGalleryCommand,
} from "../cli/gallery-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class Gallery extends Command {
	static description = commandHelp.description;
	static flags = {
		surface: Flags.string({
			description: t("cli.gallery.renderOnlyToolComposerOrSegment"),
			options: [...GALLERY_SURFACE_TOKENS],
			multiple: true,
		}),
		tool: Flags.string({ char: "t", description: t("cli.gallery.renderASingleToolByName") }),
		composer: Flags.string({ description: t("cli.gallery.renderASingleComposerShapeBy") }),
		segment: Flags.string({ description: t("cli.gallery.renderASingleStatusLineSegment") }),
		state: Flags.string({
			char: "s",
			description: t("cli.gallery.renderOnlyTheGivenLifecycleState"),
			options: GALLERY_STATE_TOKENS,
			multiple: true,
		}),
		width: Flags.integer({ char: "w", description: t("cli.gallery.renderWidthInColumns") }),
		expanded: Flags.boolean({
			char: "e",
			description: t("cli.gallery.renderTheExpandedVariantOfEach"),
			default: false,
		}),
		plain: Flags.boolean({ description: t("cli.gallery.stripAnsiStylingFromTheOutput"), default: false }),
		screenshot: Flags.boolean({
			description: t("cli.gallery.captureTheRenderedOutputAsPng"),
			default: false,
		}),
		out: Flags.string({
			char: "o",
			description: t("cli.gallery.screenshotOutputPathWithScreenshotSuffixed"),
		}),
		font: Flags.string({ description: t("cli.gallery.screenshotFontFamilyDefaultJetbrainsmonoNerd") }),
		"font-size": Flags.integer({ description: t("cli.gallery.screenshotFontSizeInPointsDefault") }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Gallery);
		let states: GalleryState[] | undefined;
		let surfaces: GallerySurface[] | undefined;
		try {
			states = parseGalleryStates(flags.state);
			surfaces = parseGallerySurfaces(flags.surface);
		} catch (err) {
			process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
			process.exitCode = 1;
			return;
		}
		await runGalleryCommand({
			surfaces,
			tool: flags.tool,
			composer: flags.composer,
			segment: flags.segment,
			states,
			width: flags.width,
			expanded: flags.expanded,
			plain: flags.plain,
			screenshot: flags.screenshot,
			out: flags.out,
			font: flags.font,
			fontSize: flags["font-size"],
		});
	}
}
