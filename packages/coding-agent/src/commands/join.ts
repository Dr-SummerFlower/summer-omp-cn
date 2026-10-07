/**
 * Join a shared collab session from the CLI: launches the interactive TUI and
 * immediately runs `/join <link>`.
 */

import { APP_NAME } from "@oh-my-pi/pi-utils";
import { Args, Command } from "@oh-my-pi/pi-utils/cli";
import { parseArgs } from "../cli/args";
import { joinHelp as commandHelp } from "../cli/command-help";
import { runRootCommand } from "../main";
import { t } from "@oh-my-pi/pi-i18n";

export default class Join extends Command {
	static description = commandHelp.description;
	static args = {
		link: Args.string({
			description: t("cli.join.collabLinkSharedByTheHost"),
			required: true,
		}),
	};

	static examples = [`${APP_NAME} join "relay.example.sh/abc123#key"`];

	async run(): Promise<void> {
		const { args } = await this.parse(Join);
		const link = args.link?.trim();
		if (!link) {
			process.stderr.write(t("cli.join.usageAppNameJoinLinkN", { APP_NAME: APP_NAME }));
			process.exitCode = 1;
			return;
		}
		if (!process.stdin.isTTY || !process.stdout.isTTY) {
			process.stderr.write(t("cli.join.appNameJoinRequiresAnInteractive", { APP_NAME: APP_NAME }));
			process.exitCode = 1;
			return;
		}
		const parsed = parseArgs([]);
		parsed.join = link;
		await runRootCommand(parsed, []);
	}
}
