/**
 * Manage SSH host configurations.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { sshHelp as commandHelp } from "../cli/command-help";
import { runSSHCommand, type SSHAction, type SSHCommandArgs } from "../cli/ssh-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

const ACTIONS: SSHAction[] = ["add", "remove", "list"];

export default class SSH extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: t("cli.ssh.sshAction"),
			required: false,
			options: ACTIONS,
		}),
		targets: Args.string({
			description: t("cli.ssh.hostNameOrArguments"),
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
		host: Flags.string({ description: t("cli.ssh.hostAddress") }),
		user: Flags.string({ description: "Username" }),
		port: Flags.string({ description: t("cli.ssh.portNumber") }),
		key: Flags.string({ description: t("cli.ssh.identityKeyPath") }),
		desc: Flags.string({ description: t("cli.ssh.hostDescription") }),
		compat: Flags.boolean({ description: t("cli.ssh.enableCompatibilityMode") }),
		scope: Flags.string({ description: t("cli.ssh.configScopeProjectUser"), options: ["project", "user"] }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(SSH);
		const action = (args.action ?? "list") as SSHAction;
		const targets = Array.isArray(args.targets) ? args.targets : args.targets ? [args.targets] : [];

		const cmd: SSHCommandArgs = {
			action,
			args: targets,
			flags: {
				json: flags.json,
				host: flags.host,
				user: flags.user,
				port: flags.port,
				key: flags.key,
				desc: flags.desc,
				compat: flags.compat,
				scope: flags.scope as "project" | "user" | undefined,
			},
		};

		await initTheme();
		await runSSHCommand(cmd);
	}
}
