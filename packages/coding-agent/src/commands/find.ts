/**
 * Semantic search from the shell: `omp find "<query>" [path]`.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { findHelp as commandHelp } from "../cli/command-help";
import { runFindCommand } from "../cli/find-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class Find extends Command {
	static description = commandHelp.description;
	static args = {
		query: Args.string({ description: t("cli.find.whatToFindInPlainLanguage"), required: false }),
		path: Args.string({ description: t("cli.find.directoryOrOmpDocsScopeTo"), required: false }),
	};

	static flags = {
		keyword: Flags.string({
			char: "k",
			description: t("cli.find.extraLexicalKeywordRepeatableOrComma"),
			multiple: true,
		}),
		hidden: Flags.boolean({ description: t("cli.find.includeDotFilesAndDotFolders") }),
		json: Flags.boolean({ description: t("cli.find.emitTheFullResultAsJson") }),
		quiet: Flags.boolean({ char: "q", description: t("cli.find.suppressProgressOnStderr") }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Find);
		await runFindCommand({
			query: args.query ?? "",
			path: args.path ?? ".",
			keywords: (flags.keyword ?? []).flatMap(value => value.split(",")),
			hidden: flags.hidden ?? false,
			json: flags.json ?? false,
			quiet: flags.quiet ?? false,
		});
	}
}
