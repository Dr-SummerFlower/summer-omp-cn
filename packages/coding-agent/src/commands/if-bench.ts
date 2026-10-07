import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { ifBenchHelp as commandHelp } from "../cli/command-help";
import { runIfBenchCommand } from "../if-bench";
import { t } from "@oh-my-pi/pi-i18n";

export default class IfBench extends Command {
	static description = commandHelp.description;
	static args = {
		models: Args.string({
			description: t("cli.bench.modelSelectorsProviderModelOrFuzzy"),
			required: true,
			multiple: true,
		}),
	};

	static flags = {
		turns: Flags.integer({ description: t("cli.ifBench.maximumTurnsPerModelTurnN") }),
		length: Flags.integer({ description: t("cli.ifBench.characterArrayLengthEven826") }),
		"max-tokens": Flags.integer({ description: t("cli.ifBench.maxOutputTokensPerTurnDefault") }),
		"nya-max": Flags.integer({ description: t("cli.ifBench.longestAcceptedCatSoundInNya") }),
		par: Flags.integer({ description: t("cli.ifBench.modelsBenchmarkedConcurrentlyDefault4") }),
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
	};

	static examples = [
		"# Compare three models on the incremental array machine\n  omp if-bench opus sonnet gpt-5.2",
		"# Go deeper, one model at a time\n  omp if-bench opus --turns 40 --par 1",
		"# Shorter array, tighter cat sound\n  omp if-bench sonnet --length 12 --nya-max 2",
		"# Machine-readable per-turn transcript\n  omp if-bench opus --json",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IfBench);
		await runIfBenchCommand({
			models: args.models ?? [],
			flags: {
				turns: flags.turns,
				length: flags.length,
				maxTokens: flags["max-tokens"],
				nyaMax: flags["nya-max"],
				par: flags.par,
				json: flags.json,
			},
		});
	}
}
