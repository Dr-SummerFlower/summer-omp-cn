/**
 * Run on-disk storage maintenance.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { gcHelp as commandHelp } from "../cli/command-help";
import { collectGcErrors, type GcCommandArgs, runGcCommand } from "../cli/gc-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class Gc extends Command {
	static description = commandHelp.description;
	static flags = {
		apply: Flags.boolean({ description: t("cli.gc.applyChangesDefaultIsDryRun") }),
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
		"agent-dir": Flags.string({ description: t("cli.gc.agentDirectoryToMaintain") }),
		blobs: Flags.boolean({ description: t("cli.gc.sweepUnreferencedBlobs") }),
		archive: Flags.boolean({ description: t("cli.gc.archiveColdSessions") }),
		wal: Flags.boolean({ description: t("cli.gc.checkpointHistoryModelDatabaseWalFiles") }),
		"cold-archive-after-days": Flags.integer({ description: t("cli.gc.minimumSessionAgeBeforeArchiving") }),
		"retain-newest-global": Flags.integer({ description: t("cli.gc.alwaysKeepThisManyNewestSessions") }),
		"retain-newest-per-cwd": Flags.integer({ description: t("cli.gc.alwaysKeepThisManyNewestSessions2") }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Gc);
		const cmd: GcCommandArgs = {
			flags: {
				apply: flags.apply,
				json: flags.json,
				agentDir: flags["agent-dir"],
				blobs: flags.blobs,
				archive: flags.archive,
				wal: flags.wal,
				coldArchiveAfterDays: flags["cold-archive-after-days"],
				retainNewestGlobal: flags["retain-newest-global"],
				retainNewestPerCwd: flags["retain-newest-per-cwd"],
			},
		};
		const result = await runGcCommand(cmd);
		const errors = collectGcErrors(result);
		if (errors.length > 0) {
			process.stderr.write(
				t("cli.gc.gcCompletedWithErrorsLengthError", {
					"errors.length": errors.length,
					arg: errors.length === 1 ? "" : "s",
					arg2: errors.map(error => `- ${error}`).join("\n"),
				}),
			);
			process.exitCode = 1;
		}
	}
}
