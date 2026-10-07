/**
 * Manage configuration settings.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { configHelp as commandHelp } from "../cli/command-help";
import { type ConfigAction, type ConfigCommandArgs, runConfigCommand } from "../cli/config-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

const ACTIONS: ConfigAction[] = ["list", "get", "set", "reset", "path", "init-xdg"];

export default class Config extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: t("cli.config.configAction"),
			required: false,
			options: ACTIONS,
		}),
		key: Args.string({
			description: t("cli.config.settingKey"),
			required: false,
		}),
		value: Args.string({
			description: t("cli.config.valueForSetReset"),
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Config);
		const action = (args.action ?? "list") as ConfigAction;
		const value = Array.isArray(args.value) ? args.value.join(" ") : args.value;

		const cmd: ConfigCommandArgs = {
			action,
			key: args.key,
			value,
			flags: {
				json: flags.json,
			},
		};

		await initTheme();
		await runConfigCommand(cmd);
	}
}
