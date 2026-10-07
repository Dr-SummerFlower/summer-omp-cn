import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { runBenchCommand } from "../cli/bench-cli";
import { benchHelp as commandHelp } from "../cli/command-help";
import { SERVICE_TIER_OPENAI_VALUES } from "../config/service-tier";
import { t } from "@oh-my-pi/pi-i18n";

export default class Bench extends Command {
	static description = commandHelp.description;
	static args = {
		models: Args.string({
			description: t("cli.bench.modelSelectorsProviderModelOrFuzzy"),
			required: true,
			multiple: true,
		}),
	};

	static flags = {
		runs: Flags.integer({
			description: t("cli.bench.requestsPerModelDefault10Chat"),
		}),
		"max-tokens": Flags.integer({
			description: t("cli.bench.maxOutputTokensPerRequestDefault"),
		}),
		prompt: Flags.string({ description: t("cli.bench.customPromptTextChatAndGeneration") }),
		profile: Flags.string({
			description: t("cli.bench.benchmarkWorkloadDefaultChatChatBalanced"),
			options: ["chat", "prefill", "generation", "mix"],
		}),
		"prefill-bytes": Flags.integer({
			description: t("cli.bench.syntheticInputSizeForPrefillChallenges"),
		}),
		detailed: Flags.boolean({
			description: t("cli.bench.runSingleUser1ConcurrentParallel"),
		}),
		"service-tier": Flags.string({
			description: t("cli.bench.serviceTierAppliedPerModelFamily"),
			options: SERVICE_TIER_OPENAI_VALUES,
		}),
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
		par: Flags.integer({
			description: t("cli.bench.executeRunsWithNParallelQueries"),
		}),
		cache: Flags.boolean({
			description: t("cli.bench.runIndependentColdWarmPromptCache"),
		}),
		"cache-prefix-file": Flags.string({ description: t("cli.bench.stablePromptPrefixFileForCache") }),
		"cache-prefix-bytes": Flags.integer({ description: t("cli.bench.stablePrefixByteBudgetForCache") }),
		"cache-pairs": Flags.integer({ description: t("cli.bench.coldWarmPairsPerModelFor") }),
		"cache-concurrency": Flags.integer({
			description: t("cli.bench.concurrentCachePairsForCacheEach"),
		}),
	};

	static examples = [
		"# Compare TTFT and tok/s of two models\n  omp bench anthropic/claude-opus-4-5 openai/gpt-5.2",
		"# Fuzzy selectors work\n  omp bench opus sonnet",
		"# Average over 3 runs each\n  omp bench opus gpt-5.2 --runs 3",
		"# Rotate chat, prefill, and generation challenges in one run\n  omp bench opus sonnet --profile mix",
		"# Isolate prompt-ingestion speed with a 64 KiB cache-busted input\n  omp bench opus sonnet --profile prefill --prefill-bytes 65536",
		"# Isolate sustained decode throughput\n  omp bench opus sonnet --profile generation",
		"# Compare single-user vs 8 concurrent users, plus prefill speed\n  omp bench apple --detailed --par 8",
		"# Force priority serving tier\n  omp bench openai-codex/gpt-5.5:low --runs 10 --service-tier priority",
		"# Measure one cold/warm prompt-cache pair\n  omp bench openai/gpt-5.6 --cache --json",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Bench);
		await runBenchCommand({
			models: args.models ?? [],
			flags: {
				runs: flags.runs,
				maxTokens: flags["max-tokens"],
				prompt: flags.prompt,
				profile: flags.profile,
				prefillBytes: flags["prefill-bytes"],
				detailed: flags.detailed,
				serviceTier: flags["service-tier"],
				json: flags.json,
				par: flags.par,
				cache: flags.cache,
				cachePrefixFile: flags["cache-prefix-file"],
				cachePrefixBytes: flags["cache-prefix-bytes"],
				cachePairs: flags["cache-pairs"],
				cacheConcurrency: flags["cache-concurrency"],
			},
		});
	}
}
