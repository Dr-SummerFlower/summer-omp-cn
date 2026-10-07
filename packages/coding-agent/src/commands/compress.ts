import { postmortem } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { compressHelp as commandHelp } from "../cli/command-help";
import { CliUsageError } from "../cli/usage-error";
import { runCompressCommand } from "../compress";
import { t } from "@oh-my-pi/pi-i18n";

export default class Compress extends Command {
	static description = commandHelp.description;
	static args = {
		files: Args.string({
			description: t("cli.compress.filesOrGlobPatternsToCompress"),
			required: true,
			multiple: true,
		}),
	};
	static flags = {
		out: Flags.string({ char: "o", description: t("cli.compress.writeTheApprovedTextHereInstead") }),
		inPlace: Flags.boolean({ char: "i", description: t("cli.compress.overwriteEachSourceFileWithIts") }),
		rounds: Flags.integer({ char: "r", description: t("cli.compress.maximumDraftsPerFileBeforeGiving"), default: 3 }),
		agents: Flags.integer({ char: "n", description: t("cli.compress.filesCompressedConcurrently"), default: 4 }),
		model: Flags.string({ char: "m", description: t("cli.compress.modelSelector") }),
	};

	static examples = [
		"omp compress prompts/tools/read.md",
		"omp compress notes.md -o notes.compressed.md",
		"omp compress 'src/prompts/**/*.md' -i",
		"omp compress a.md b.md c.md -i -n 8",
		"omp compress spec.md -r 5 -m opus",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Compress);
		const files = args.files ?? [];
		if (files.length === 0) throw new CliUsageError("compress requires at least one file or glob pattern");
		if (flags.rounds <= 0) throw new CliUsageError("--rounds must be a positive integer");
		if (flags.agents <= 0) throw new CliUsageError("--agents must be a positive integer");
		if (flags.inPlace && flags.out) throw new CliUsageError("--in-place and --out are mutually exclusive");
		const result = await runCompressCommand({
			files,
			model: flags.model,
			maxRounds: flags.rounds,
			concurrency: flags.agents,
			output: flags.out,
			inPlace: flags.inPlace,
		});
		await postmortem.quit(result.exitCode);
	}
}
