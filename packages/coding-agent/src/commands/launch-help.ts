import { Args, type CommandMetadata, Flags } from "@oh-my-pi/pi-utils/cli";
import { APP_NAME } from "@oh-my-pi/pi-utils/dirs";
import { formatKeyHint } from "@oh-my-pi/pi-tui/key-hint-format";
import { CLI_THINKING_LEVELS } from "@oh-my-pi/pi-tui/thinking";
import { SERVICE_TIER_OPENAI_VALUES } from "../config/service-tier";
import { t } from "@oh-my-pi/pi-i18n";

export const launchHelp = {
	description: t("cli.launch.aiCodingAssistant"),
	hidden: true,
	args: {
		messages: Args.string({
			description: t("cli.launch.messagesToSendPrefixFilesWith"),
			required: false,
			multiple: true,
		}),
	},
	flags: {
		model: Flags.string({
			description: t("cli.launch.modelToUseFuzzyMatchOpus"),
		}),
		smol: Flags.string({ description: t("cli.launch.smolFastModelForLightweightTasks") }),
		slow: Flags.string({ description: t("cli.launch.slowReasoningModelForThoroughAnalysis") }),
		plan: Flags.string({ description: t("cli.launch.planModelForArchitecturalPlanningOr") }),
		"plan-yolo": Flags.boolean({
			description: t("cli.launch.forceReadOnlyPlanModeAt"),
		}),
		"plan-yolo-into": Flags.string({ description: t("cli.launch.targetModelForPlanYoloExecution") }),
		provider: Flags.string({ description: t("cli.launch.providerToUseLegacyPreferModel") }),
		"api-key": Flags.string({ description: t("cli.launch.apiKeyDefaultsToEnvVars") }),
		"system-prompt": Flags.string({ description: t("cli.launch.systemPromptDefaultCodingAssistantPrompt") }),
		"system-prompt-template": Flags.string({
			description: t("cli.launch.handlebarsSystemPromptTemplateMutuallyExclusive"),
		}),
		"append-system-prompt": Flags.string({ description: t("cli.launch.appendTextOrFileContentsTo") }),
		"allow-home": Flags.boolean({ description: t("cli.launch.allowStartingInWithoutAutoSwitching") }),
		profile: Flags.string({ description: t("cli.launch.useAnIsolatedProfileForAuth") }),
		alias: Flags.string({ description: t("cli.launch.createAShellShortcutForThe") }),
		cwd: Flags.string({ description: t("cli.launch.directoryToStartInOverridesThe") }),
		mode: Flags.string({
			description: t("cli.launch.outputModeTextDefaultJsonRpc"),
			options: ["text", "json", "rpc", "acp", "rpc-ui"],
		}),
		config: Flags.string({
			description: t("cli.launch.loadAnExtraConfigYmlStyle"),
			multiple: true,
		}),
		"add-dir": Flags.string({
			description: t("cli.launch.addAWorkspaceDirectoryBeyondThe"),
			multiple: true,
		}),
		print: Flags.boolean({ char: "p", description: t("cli.launch.nonInteractiveModeProcessPromptAnd") }),
		continue: Flags.boolean({ char: "c", description: t("cli.launch.continuePreviousSession") }),
		resume: Flags.string({ char: "r", description: t("cli.launch.resumeASessionByIdPrefix") }),
		"from-claude": Flags.boolean({ description: t("cli.launch.importAClaudeCodeSessionInto") }),
		"from-codex": Flags.boolean({ description: t("cli.launch.importACodexSessionIntoOmp") }),
		"session-dir": Flags.string({ description: t("cli.launch.directoryForSessionStorageAndLookup") }),
		"no-session": Flags.boolean({ description: t("cli.launch.donTSaveSessionEphemeral") }),
		models: Flags.string({
			description: t("cli.launch.commaSeparatedModelPatternsForFormatkeyhint", { arg: formatKeyHint("ctrl+p") }),
		}),
		"no-tools": Flags.boolean({ description: t("cli.launch.disableAllBuiltInTools") }),
		"no-lsp": Flags.boolean({ description: t("cli.launch.disableLspToolsFormattingAndDiagnostics") }),
		"no-pty": Flags.boolean({ description: t("cli.launch.disablePtyBasedInteractiveBashExecution") }),
		tools: Flags.string({ description: t("cli.launch.commaSeparatedListOfToolsTo") }),
		thinking: Flags.string({
			description: `Set thinking level: ${CLI_THINKING_LEVELS.join(", ")}`,
			options: [...CLI_THINKING_LEVELS],
		}),
		"service-tier": Flags.string({
			description: t("cli.launch.openaiServiceTierForThisSession"),
			options: [...SERVICE_TIER_OPENAI_VALUES],
		}),
		"hide-thinking": Flags.boolean({
			description: t("cli.launch.hideThinkingBlocksInTuiOutput"),
		}),
		"external-thinking": Flags.boolean({
			description: t("cli.launch.useAPrivateScratchpadWhileDisabling"),
		}),
		hook: Flags.string({ description: t("cli.launch.loadAHookExtensionFileCan"), multiple: true }),
		extension: Flags.string({
			char: "e",
			description: t("cli.launch.loadAnExtensionFileCanBe"),
			multiple: true,
		}),
		"no-extensions": Flags.boolean({
			description: t("cli.launch.disableExtensionDiscoveryExplicitEPaths"),
		}),
		"no-skills": Flags.boolean({ description: t("cli.launch.disableSkillsDiscoveryAndLoading") }),
		skills: Flags.string({ description: t("cli.launch.commaSeparatedGlobPatternsToFilter") }),
		"no-rules": Flags.boolean({ description: t("cli.launch.disableRulesDiscoveryAndLoading") }),
		export: Flags.string({ description: t("cli.launch.exportSessionFileToHtmlAnd") }),
		"no-title": Flags.boolean({ description: t("cli.launch.disableTitleAutoGeneration") }),
		"no-ui": Flags.boolean({
			description: t("cli.launch.withModeRpcRunExtensionsHeadless"),
		}),
		"print-thoughts": Flags.boolean({ description: t("cli.launch.includeThinkingBlocksInPrintMode") }),
		"max-time": Flags.string({ description: t("cli.launch.stopTheSessionAfterThisDuration") }),
		"auto-approve": Flags.boolean({
			aliases: ["yolo"],
			description: t("cli.launch.autoApproveAllToolCallsSkip"),
		}),
		"approval-mode": Flags.string({
			options: ["always-ask", "write", "yolo"],
			description: t("cli.launch.overrideToolsApprovalmodeForThisSession"),
		}),
	},
	examples: [
		`# Interactive mode\n  ${APP_NAME}`,
		`# Interactive mode with initial prompt\n  ${APP_NAME} "List all .ts files in src/"`,
		`# Include files in initial message\n  ${APP_NAME} @prompt.md @image.png "What color is the sky?"`,
		`# Non-interactive mode (process and exit)\n  ${APP_NAME} -p "List all .ts files in src/"`,
		`# Continue previous session\n  ${APP_NAME} --continue "What did we discuss?"`,
		`# Create a shell shortcut for a work profile\n  ${APP_NAME} --profile work --alias omp-work`,
		`# Use different model (fuzzy matching)\n  ${APP_NAME} --model opus "Help me refactor this code"`,
		`# Limit model cycling to specific models\n  ${APP_NAME} --models claude-sonnet,claude-haiku,gpt-4o`,
		`# Export a session file to HTML\n  ${APP_NAME} --export ~/.omp/agent/sessions/--path--/session.jsonl`,
	],
} satisfies CommandMetadata;
