/**
 * Test grep tool.
 */

import { GrepOutputMode } from "@oh-my-pi/pi-natives";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { grepHelp as commandHelp } from "../cli/command-help";
import { type GrepCommandArgs, runGrepCommand } from "../cli/grep-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { t } from "@oh-my-pi/pi-i18n";

export default class Grep extends Command {
	static description = commandHelp.description;
	static args = {
		pattern: Args.string({ description: t("cli.grep.regexPatternToSearchFor"), required: false }),
		path: Args.string({
			description: t("tui.ca.extensibility.legacyPiCodingAgentShim.directoryOrFileToSearch"),
			required: false,
		}),
	};

	static flags = {
		glob: Flags.string({ char: "g", description: t("cli.grep.filterFilesByGlobPattern") }),
		limit: Flags.integer({ char: "l", description: t("cli.grep.maxMatches"), default: 20 }),
		context: Flags.integer({
			char: "C",
			description: t("tui.ca.extensibility.legacyPiCodingAgentShim.contextLines"),
			default: 2,
		}),
		files: Flags.boolean({ char: "f", description: t("cli.grep.outputFileNamesOnly") }),
		count: Flags.boolean({ char: "c", description: t("cli.grep.outputMatchCountsPerFile") }),
		"no-gitignore": Flags.boolean({ description: t("cli.grep.includeFilesExcludedByGitignore") }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Grep);

		const mode: GrepCommandArgs["mode"] = flags.count
			? GrepOutputMode.Count
			: flags.files
				? GrepOutputMode.FilesWithMatches
				: GrepOutputMode.Content;

		const cmd: GrepCommandArgs = {
			pattern: args.pattern ?? "",
			path: args.path ?? ".",
			glob: flags.glob,
			limit: flags.limit,
			context: flags.context,
			mode,
			gitignore: !flags["no-gitignore"],
		};

		await initTheme();
		await runGrepCommand(cmd);
	}
}
