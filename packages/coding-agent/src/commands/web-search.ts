/**
 * Test web search models.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { searchHelp as commandHelp } from "../cli/command-help";
import { runSearchCommand, type SearchCommandArgs } from "../cli/web-search-cli";
import { t } from "@oh-my-pi/pi-i18n";

const RECENCY: NonNullable<SearchCommandArgs["recency"]>[] = ["day", "week", "month", "year"];

export default class Search extends Command {
	static description = commandHelp.description;
	static aliases = ["q", "web-search"];

	static args = {
		query: Args.string({ description: t("cli.webSearch.searchQueryText"), required: false, multiple: true }),
	};

	static flags = {
		model: Flags.string({ description: t("cli.webSearch.catalogModelSelector") }),
		recency: Flags.string({ description: t("cli.webSearch.recencyFilter"), options: RECENCY }),
		limit: Flags.integer({ char: "l", description: t("cli.webSearch.maxResultsToReturn") }),
		compact: Flags.boolean({ description: t("cli.webSearch.renderCondensedOutput") }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Search);
		const query = Array.isArray(args.query) ? args.query.join(" ") : (args.query ?? "");

		const cmd: SearchCommandArgs = {
			query,
			model: flags.model,
			recency: flags.recency as SearchCommandArgs["recency"],
			limit: flags.limit,
			expanded: !flags.compact,
		};

		await runSearchCommand(cmd);
	}
}
