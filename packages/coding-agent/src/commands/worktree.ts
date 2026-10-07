/**
 * List and clean up agent-managed git worktrees under `~/.omp/wt`.
 */

import { getProjectDir } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { worktreeHelp as commandHelp } from "../cli/command-help";
import { addWorktree, clearWorktrees, listWorktrees } from "../cli/worktree-cli";
import { Settings } from "../config/settings";
import { t } from "@oh-my-pi/pi-i18n";

export default class Worktree extends Command {
	static description = commandHelp.description;
	static aliases = ["wt"];

	static args = {
		// A positional action keeps `omp worktree` (the no-arg form) useful.
		action: Args.string({
			description: t("cli.worktree.listDefaultClearOrAdd"),
			required: false,
			options: ["list", "clear", "add"],
			default: "list",
		}),
		path: Args.string({
			description: t("cli.worktree.worktreePathAdd"),
			required: false,
		}),
		commit: Args.string({
			description: t("cli.worktree.commitIshToCheckOutAdd"),
			required: false,
		}),
	};

	static flags = {
		cwd: Flags.string({
			char: "C",
			description: t("cli.worktree.repositoryBaseDirectoryAdd"),
		}),
		branch: Flags.string({
			char: "b",
			description: t("cli.worktree.createANewBranchAdd"),
			exclusive: ["force-branch"],
		}),
		"force-branch": Flags.string({
			char: "B",
			description: t("cli.worktree.createOrResetABranchAdd"),
			exclusive: ["branch"],
		}),
		detach: Flags.boolean({
			char: "d",
			description: t("cli.worktree.detachHeadAdd"),
			default: false,
		}),
		quiet: Flags.boolean({
			char: "q",
			description: t("cli.worktree.suppressAddOutput"),
			default: false,
		}),
		all: Flags.boolean({
			description: t("cli.worktree.clearEveryEntryIncludingLivePr"),
			default: false,
		}),
		"dry-run": Flags.boolean({
			char: "n",
			description: t("cli.worktree.printWhatWouldBeRemovedWithout"),
			default: false,
		}),
		json: Flags.boolean({ char: "j", description: t("cli.ps.json.description"), default: false }),
	};

	static examples = [
		"omp worktree",
		"omp worktree list --json",
		"omp worktree add ../feature",
		"omp worktree add -b feature ../feature origin/main",
		"omp worktree add --detach ../review HEAD~2",
		"omp worktree clear",
		"omp worktree clear --dry-run",
		"omp worktree clear --all",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Worktree);
		// Load settings so the `worktree.base` override is applied before we scan
		// — otherwise this command would inspect ~/.omp/wt while the agent created
		// its worktrees under the configured base.
		if (args.action === "add") {
			if (!args.path) {
				console.error(t("cli.worktree.errorMissingRequiredArgumentPath"));
				process.exitCode = 1;
				return;
			}
			try {
				await addWorktree({
					cwd: flags.cwd,
					path: args.path,
					commit: args.commit,
					branch: flags.branch,
					forceBranch: flags["force-branch"],
					detach: flags.detach ?? false,
					quiet: flags.quiet ?? false,
				});
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
			return;
		}

		await Settings.init({ cwd: getProjectDir() });
		if (args.action === "clear") {
			const { failed } = await clearWorktrees({
				all: flags.all ?? false,
				dryRun: flags["dry-run"] ?? false,
				json: flags.json ?? false,
			});
			if (failed > 0) process.exitCode = 1;
			return;
		}
		await listWorktrees({ json: flags.json ?? false });
	}
}
