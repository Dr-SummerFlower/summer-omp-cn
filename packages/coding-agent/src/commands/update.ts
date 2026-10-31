/**
 * Check for and install updates.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { updateHelp as commandHelp } from "../cli/command-help";
import * as updateCli from "../cli/update-cli";
import { CliUsageError } from "../cli/usage-error";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

export default class Update extends Command {
	static description = commandHelp.description;
	static flags = {
		force: Flags.boolean({ char: "f", description: t("cli.update.forceUpdate"), default: false }),
		check: Flags.boolean({
			char: "c",
			description: t("cli.update.checkForUpdatesWithoutInstalling"),
			default: false,
		}),
		canary: Flags.boolean({ description: t("cli.update.switchToTheCanaryChannelAnd"), default: false }),
		stable: Flags.boolean({ description: t("cli.update.switchBackToTheStableChannel"), default: false }),
	};

	static examples = [
		"omp update",
		"omp update --check",
		"omp update --canary",
		"# If GitHub rate-limits release metadata, set GITHUB_TOKEN or GH_TOKEN\n  GITHUB_TOKEN=... omp update",
	];

	async run(): Promise<void> {
		const { flags } = await this.parse(Update);
		await initTheme();
		if (flags.canary && flags.stable) throw new CliUsageError("--canary and --stable are mutually exclusive");
		await updateCli.runUpdateCommand({
			force: flags.force,
			check: flags.check,
			channel: flags.canary ? "canary" : flags.stable ? "stable" : undefined,
		});
	}
}
