import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { dryBalanceHelp as commandHelp } from "../cli/command-help";
import { runDryBalanceCommand } from "../cli/dry-balance-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class DryBalance extends Command {
	static description = commandHelp.description;
	static args = {
		model: Args.string({
			description: t("cli.dryBalance.modelSelectorProviderModelOrFuzzy"),
			required: false,
		}),
	};

	static flags = {
		model: Flags.string({ description: t("cli.dryBalance.modelSelectorSameSyntaxAsModel") }),
		count: Flags.integer({ description: t("cli.dryBalance.numberOfRandomSessionIdsTo"), default: 100 }),
		concurrency: Flags.integer({
			description: t("cli.dryBalance.maximumConcurrentCredentialResolutions"),
			default: 32,
		}),
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
		bench: Flags.boolean({ description: t("cli.dryBalance.sendOneLiveBenchmarkRequestPer") }),
	};

	static examples = [
		"# Dry-run the configured default model with 100 random session ids\n  omp dry-balance",
		"# Dry-run a specific model\n  omp dry-balance anthropic/claude-sonnet-4-5",
		"# Larger run with bounded concurrency\n  omp dry-balance --model openai-codex/gpt-5-codex --count 1000 --concurrency 64",
		"# Benchmark every OAuth account in parallel\n  omp dry-balance --bench",
		"# Machine-readable output\n  omp dry-balance --json",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(DryBalance);
		await runDryBalanceCommand({
			model: args.model,
			flags: {
				model: flags.model,
				count: flags.count,
				concurrency: flags.concurrency,
				json: flags.json,
				bench: flags.bench,
			},
		});
	}
}
