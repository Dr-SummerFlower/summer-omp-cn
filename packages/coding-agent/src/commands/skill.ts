/**
 * Install, publish, and manage skills on a Skillshare registry (skills.omp.sh).
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import type { SkillSearchSort } from "@oh-my-pi/pi-wire/skillshare";
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
		global: Flags.boolean({ char: "g", description: t("cli.skill.useTheUserGlobalSkillsJson") }),
		yes: Flags.boolean({ char: "y", description: t("cli.skill.installOrUpdateSkillsThatShip") }),
		json: Flags.boolean({ description: t("cli.skill.outputJsonSearchInfoTokenList") }),
		sort: Flags.string({ description: t("cli.skill.searchOrder"), options: ["relevance", "downloads", "recent"] }),
		scope: Flags.string({ description: t("cli.skill.publishingScopeDefaultYourStencilUsername") }),
		tag: Flags.string({ description: t("cli.skill.distTagForThePublishedVersion") }),
		"dry-run": Flags.boolean({ description: t("cli.skill.packAndValidateWithoutPublishing") }),
		"allow-secrets": Flags.boolean({ description: t("cli.skill.publishEvenWhenCredentialShapedStrings") }),
		registry: Flags.string({ description: t("cli.skill.registryBaseUrlOverridesSkillsRegistryurl") }),
		undo: Flags.boolean({ description: t("cli.skill.reverseAYankOrDeprecation") }),
		package: Flags.string({ description: t("cli.skill.restrictANewTokenToA"), multiple: true }),
		expires: Flags.integer({ description: t("cli.skill.tokenLifetimeInDays") }),
	};

	static examples = [
		"omp skill install @alice/pdf-tools",
		"omp skill install -g @alice/pdf-tools@^1.2",
		'omp skill search "pdf" --sort downloads',
		"omp skill version minor && omp skill publish",
		"omp skill publish ./skills/pdf-tools --dry-run",
		"omp skill tag @alice/pdf-tools@2.0.0-beta.1 next",
		'omp skill deprecate @alice/pdf-tools@"<1.0.0" "use 1.x"',
		"omp skill token create ci --package @alice/pdf-tools --expires 90",
	];

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
				tag: flags.tag,
				dryRun: flags["dry-run"],
				allowSecrets: flags["allow-secrets"],
				registry: flags.registry,
				scope: flags.scope,
				undo: flags.undo,
				global: flags.global,
				yes: flags.yes,
				json: flags.json,
				sort: flags.sort as SkillSearchSort | undefined,
				package: flags.package,
				expires: flags.expires,
			},
		});
		if (exitCode !== 0) process.exitCode = exitCode;
	}
}
