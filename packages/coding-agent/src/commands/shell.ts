/**
 * Interactive shell console.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { shellHelp as commandHelp } from "../cli/command-help";
import { runShellCommand, type ShellCommandArgs } from "../cli/shell-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

export default class Shell extends Command {
	static description = commandHelp.description;
	static flags = {
		cwd: Flags.string({ char: "C", description: t("cli.shell.setWorkingDirectoryForCommands") }),
		timeout: Flags.integer({ char: "t", description: t("cli.shell.timeoutPerCommandInMilliseconds") }),
		"no-snapshot": Flags.boolean({ description: t("cli.shell.skipSourcingSnapshotFromUserShell") }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Shell);

		const cmd: ShellCommandArgs = {
			cwd: flags.cwd,
			timeoutMs: flags.timeout,
			noSnapshot: flags["no-snapshot"],
		};

		await initTheme();
		await runShellCommand(cmd);
	}
}
