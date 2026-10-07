/**
 * Draw a session's entire thread through the production transcript pipeline.
 */

import { postmortem } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { renderHelp as commandHelp } from "../cli/command-help";
import { runRenderCommand } from "../cli/render-cli";
import { CliUsageError } from "../cli/usage-error";
import { t } from "@oh-my-pi/pi-i18n";

export default class Render extends Command {
	static description = commandHelp.description;
	static args = {
		session: Args.string({ description: t("cli.render.sessionFilePathOrIdPrefix") }),
	};
	static flags = {
		width: Flags.integer({ char: "w", description: t("cli.render.renderWidthInColumnsDefaultTerminal") }),
		height: Flags.integer({ description: t("cli.render.viewportHeightInRowsDefaultTerminal") }),
		timing: Flags.boolean({ char: "t", description: t("cli.render.printPhaseTimingsAndEmittedByte") }),
		repaint: Flags.integer({
			description: t("cli.render.benchmarkNExtraFullClearScrollback"),
		}),
		plain: Flags.boolean({ description: t("cli.gallery.stripAnsiStylingFromTheOutput"), default: false }),
		quiet: Flags.boolean({
			char: "q",
			description: t("cli.render.suppressTranscriptOutputBenchmarkRuns"),
			default: false,
		}),
	};

	static examples = [
		"omp render",
		"omp render 01a0285c --plain",
		"omp render ~/.omp/agent/sessions/--work-pi--/big.jsonl -q -t --repaint 5",
		"omp render -w 200 > thread.ansi",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Render);
		if (flags.repaint !== undefined && flags.repaint <= 0) {
			throw new CliUsageError("--repaint must be a positive integer");
		}
		const exitCode = await runRenderCommand({
			session: args.session,
			width: flags.width,
			height: flags.height,
			timing: flags.timing,
			repaint: flags.repaint,
			plain: flags.plain,
			quiet: flags.quiet,
		});
		await postmortem.quit(exitCode);
	}
}
