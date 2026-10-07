/**
 * View usage statistics dashboard.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { statsHelp as commandHelp } from "../cli/command-help";
import type { StatsCommandArgs } from "../cli/stats-cli";
import * as statsCli from "../cli/stats-cli";
import * as theme from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

export default class Stats extends Command {
	static description = commandHelp.description;
	static flags = {
		port: Flags.integer({ char: "p", description: t("cli.stats.portForTheDashboardServer"), default: 3847 }),
		host: Flags.string({ description: t("cli.stats.hostToBind"), default: "127.0.0.1" }),
		json: Flags.boolean({ char: "j", description: t("cli.stats.outputStatsAsJson"), default: false }),
		summary: Flags.boolean({ char: "s", description: t("cli.stats.printSummaryToConsole"), default: false }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Stats);

		const cmd: StatsCommandArgs = {
			port: flags.port,
			host: flags.host ?? "127.0.0.1",
			json: flags.json,
			summary: flags.summary,
		};

		await theme.initTheme();
		await statsCli.runStatsCommand(cmd);
	}
}
