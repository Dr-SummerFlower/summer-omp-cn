/**
 * Inspect and control daemon-broker supervised processes from outside the harness.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { psHelp as commandHelp } from "../cli/command-help";
import { type PsAction, type PsCommandArgs, runPsCommand } from "../cli/ps-cli";
import { t } from "@oh-my-pi/pi-i18n";

const ACTIONS: PsAction[] = ["list", "info", "logs", "stop", "kill", "restart"];

export default class Ps extends Command {
	static description = commandHelp.description;

	static args = {
		action: Args.string({
			description: t("cli.ps.action.description"),
			required: false,
			options: ACTIONS,
		}),
		name: Args.string({
			description: t("cli.ps.name.description"),
			required: false,
		}),
	};

	static flags = {
		all: Flags.boolean({ char: "a", description: t("cli.ps.alsoListOtherProjectsAndExited") }),
		json: Flags.boolean({ char: "j", description: t("cli.ps.json.description") }),
		plain: Flags.boolean({ description: t("cli.ps.plain.description") }),
		dir: Flags.string({ description: t("cli.ps.dir.description") }),
		global: Flags.string({ description: t("cli.ps.global.description") }),
		follow: Flags.boolean({ char: "f", description: t("cli.ps.follow.description") }),
		head: Flags.boolean({ description: t("cli.ps.head.description") }),
		lines: Flags.integer({ char: "n", description: t("cli.ps.lines.description") }),
		grep: Flags.string({ description: t("cli.ps.grep.description") }),
		timeout: Flags.integer({ description: t("cli.ps.timeout.description") }),
	};

	static examples = [
		"omp ps",
		"omp ps --all",
		"omp ps logs web --follow",
		"omp ps stop web",
		"omp ps kill web",
		"omp ps info relay --global browser-relay",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Ps);
		const cmd: PsCommandArgs = {
			action: (args.action ?? "list") as PsAction,
			name: args.name,
			flags: {
				all: flags.all ?? false,
				json: flags.json ?? false,
				plain: flags.plain ?? false,
				dir: flags.dir,
				global: flags.global,
				follow: flags.follow ?? false,
				head: flags.head ?? false,
				lines: flags.lines,
				grep: flags.grep,
				timeout: flags.timeout,
			},
		};
		await runPsCommand(cmd);
	}
}
