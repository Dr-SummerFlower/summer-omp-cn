/**
 * List the skills a session in a directory resolves.
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { skillHelp as commandHelp } from "../cli/command-help";
import { runSkillCommand, SKILL_ACTIONS, SKILL_USAGE, type SkillAction } from "../cli/skill-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class Skill extends Command {
	static description = commandHelp.description;
	static aliases = ["skills"];

	static args = {
		action: Args.string({ description: t("cli.skill.skillAction"), required: false, options: SKILL_ACTIONS }),
		targets: Args.string({
			description: t("cli.skill.specsNamesDirectoriesOrActionArguments"),
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: t("cli.skill.outputJsonSearchInfoTokenList") }),
	};

	static examples = ["omp skill list", "omp skill list ./packages/app --json"];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Skill);
		if (!args.action) {
			process.stdout.write(SKILL_USAGE);
			return;
		}
		const exitCode = await runSkillCommand({
			action: args.action as SkillAction,
			args: args.targets ?? [],
			cwd: process.cwd(),
			flags: {
				json: flags.json,
			},
		});
		if (exitCode !== 0) process.exitCode = exitCode;
	}
}
