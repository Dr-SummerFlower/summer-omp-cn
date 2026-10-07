import { existsSync } from "node:fs";
import * as path from "node:path";
/**
 * `omp ttsr` — inspect and test Time-Traveling Stream Rules.
 *
 * `omp ttsr test` feeds a snippet (inline, --file, or stdin) through the real
 * TTSR matching pipeline and reports which rules would trigger. `omp ttsr list`
 * shows every TTSR-registered rule the current project/user config would load.
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { ttsrHelp as commandHelp } from "../cli/command-help";
import {
	runTtsrCommand,
	TTSR_ACTIONS,
	TTSR_SOURCES,
	type TtsrCommandArgs,
	type TtsrScanArgs,
	type TtsrTestArgs,
} from "../cli/ttsr-cli";
import type { TtsrMatchSource } from "../export/ttsr";
import { t } from "@oh-my-pi/pi-i18n";

export default class Ttsr extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: t("cli.ttsr.ttsrAction"),
			required: false,
			options: TTSR_ACTIONS,
		}),
		snippet: Args.string({
			description: t("cli.ttsr.inlineSnippetTextToTestTtsr"),
			required: false,
		}),
	};

	static flags = {
		file: Flags.string({ description: t("cli.ttsr.snippetFilePathOrForStdin") }),
		rule: Flags.string({
			char: "r",
			description: t("cli.ttsr.ruleMarkdownFileToTestIn"),
		}),
		source: Flags.string({
			description: t("cli.ttsr.matchSourceTextThinkingOrTool"),
			options: TTSR_SOURCES,
		}),
		tool: Flags.string({
			description: t("cli.ttsr.toolNameWhenSourceIsTool"),
		}),
		path: Flags.string({
			char: "p",
			description: t("cli.ttsr.candidateFilePathForScopeGlob"),
		}),
		agent: Flags.string({
			description: t("cli.ttsr.agentNameToEvaluateRuleAgents"),
		}),
		verbose: Flags.boolean({ char: "v", description: t("cli.ttsr.showEveryEvaluatedRuleNotJust") }),
		json: Flags.boolean({ description: t("cli.agents.outputJson") }),
		"no-gitignore": Flags.boolean({ description: t("cli.ttsr.includeFilesExcludedByGitignoreTtsr") }),
		"max-bytes": Flags.integer({
			description: t("cli.ttsr.maximumFileSizeToScanIn"),
		}),
	};

	static examples = [
		"omp ttsr list",
		"omp ttsr test 'const x: any = 1'",
		"omp ttsr test src/foo.ts",
		"omp ttsr test --file src/foo.ts",
		"omp ttsr test --file src/foo.ts --source text",
		"omp ttsr test --rule .omp/rules/no-any.md --source tool --path src/foo.ts 'const x: any = 1'",
		"omp ttsr test --agent scout 'const x: any = 1'",
		"echo 'Box::leak(&mut v)' | omp ttsr test --file - --path src/lib.rs",
		"omp ttsr test --source tool --tool edit --path src/foo.ts 'const x: any = 1'",
		"omp ttsr scan",
		"omp ttsr scan src/",
		"omp ttsr scan -r .omp/rules/no-any.md src/",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Ttsr);
		const action = (args.action ?? "list") as (typeof TTSR_ACTIONS)[number];

		// A positional that resolves to an existing file is a snippet file, not
		// inline text — so `omp ttsr test src/foo.ts` works without --file.
		// --file always wins over the positional.
		let file = flags.file;
		let snippet = args.snippet;
		if (action === "test" && snippet && !file) {
			const resolved = path.resolve(snippet);
			if (existsSync(resolved)) {
				file = resolved;
				snippet = undefined;
			}
		}

		const test: TtsrTestArgs | undefined =
			action === "test"
				? {
						snippet,
						file,
						rule: flags.rule,
						source: flags.source as TtsrMatchSource | undefined,
						tool: flags.tool,
						filePath: flags.path,
						verbose: flags.verbose,
						agent: flags.agent,
					}
				: undefined;

		const scan: TtsrScanArgs | undefined =
			action === "scan"
				? {
						directory: args.snippet,
						rule: flags.rule,
						gitignore: !flags["no-gitignore"],
						maxBytes: flags["max-bytes"],
						verbose: flags.verbose,
					}
				: undefined;

		const cmd: TtsrCommandArgs = {
			action,
			test,
			scan,
			json: flags.json,
		};

		await runTtsrCommand(cmd);
	}
}
