/**
 * Manage plugins (install, uninstall, list, etc.).
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { pluginHelp as commandHelp } from "../cli/command-help";
import { type PluginAction, type PluginCommandArgs, runPluginCommand } from "../cli/plugin-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

const ACTIONS: PluginAction[] = [
	"install",
	"uninstall",
	"list",
	"link",
	"doctor",
	"features",
	"config",
	"enable",
	"disable",
];

export default class Plugin extends Command {
	static description = commandHelp.description;
	static aliases = ["plugins"];
	static args = {
		action: Args.string({
			description: t("cli.plugin.pluginAction"),
			required: false,
			options: ACTIONS,
		}),
		targets: Args.string({
			description: t("cli.plugin.packagesPathsOrPluginNames"),
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
		fix: Flags.boolean({ description: t("cli.plugin.attemptToFixIssuesDoctor") }),
		force: Flags.boolean({ description: t("cli.install.forceInstall") }),
		"dry-run": Flags.boolean({ description: t("cli.install.showActionsWithoutApplyingChanges") }),
		local: Flags.boolean({ char: "l", description: t("cli.plugin.operateOnLocalPluginDirectory") }),
		enable: Flags.string({ description: t("cli.plugin.enableAFeature") }),
		disable: Flags.string({ description: t("cli.plugin.disableAFeature") }),
		set: Flags.string({ description: t("cli.plugin.setPluginConfigKeyValue") }),
		scope: Flags.string({
			description: t("cli.plugin.installScopeUserDefaultOrProject"),
			options: ["user", "project"],
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Plugin);
		const action = (args.action ?? "list") as PluginAction;

		const targets = Array.isArray(args.targets) ? args.targets : args.targets ? [args.targets] : [];
		const cmd: PluginCommandArgs = {
			action,
			args: targets,
			flags: {
				json: flags.json,
				fix: flags.fix,
				force: flags.force,
				dryRun: flags["dry-run"],
				local: flags.local,
				enable: flags.enable,
				disable: flags.disable,
				set: flags.set,
				scope: flags.scope as "user" | "project" | undefined,
			},
		};

		await initTheme();
		await runPluginCommand(cmd);
	}
}
