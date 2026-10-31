import type { CommandMetadata } from "@oh-my-pi/pi-utils/cli";
import { t } from "@oh-my-pi/pi-i18n";

export const acpHelp = {
	description: t("cli.commandHelp.runOmpAsAnAcpAgent"),
} satisfies CommandMetadata;

export const agentsHelp = { description: t("cli.commandHelp.manageBundledTaskAgents") } satisfies CommandMetadata;

export const authBrokerHelp = {
	description: t("cli.commandHelp.manageTheOmpAuthBrokerCredential"),
} satisfies CommandMetadata;

export const authGatewayHelp = {
	description: t("cli.commandHelp.runAnAuthGatewayForwardProxy"),
} satisfies CommandMetadata;

export const benchHelp = {
	description: t("cli.commandHelp.benchmarkModelsTtftPrefillVsDecode"),
} satisfies CommandMetadata;

export const browserRelayHelp = {
	description: t("cli.commandHelp.runTheLocalCdpRelayThat"),
} satisfies CommandMetadata;

export const commitHelp = {
	description: t("cli.commandHelp.generateACommitMessageAndUpdate"),
} satisfies CommandMetadata;

export const completionsHelp = {
	description: t("cli.commandHelp.printAShellCompletionScriptBash"),
} satisfies CommandMetadata;

export const completeHelp = { hidden: true } satisfies CommandMetadata;

export const compressHelp = {
	description: t("cli.commandHelp.rewriteATextFileIntoThe"),
} satisfies CommandMetadata;

export const configHelp = { description: t("cli.commandHelp.manageConfigurationSettings") } satisfies CommandMetadata;

export const galleryHelp = {
	description: t("cli.commandHelp.previewToolComposerAndStatusLine"),
} satisfies CommandMetadata;

export const gcHelp = { description: t("cli.commandHelp.runStorageGarbageCollection") } satisfies CommandMetadata;
export const gitHelp = {
	description: t("cli.commandHelp.interactiveFullscreenGitUiSplitDiff"),
} satisfies CommandMetadata;

export const findHelp = {
	description: t("cli.commandHelp.semanticSearchDescribeABehaviorGet"),
} satisfies CommandMetadata;

export const grepHelp = { description: t("cli.commandHelp.testGrepTool") } satisfies CommandMetadata;

export const loginHelp = {
	description: t("cli.commandHelp.logInToAModelProvider"),
} satisfies CommandMetadata;

export const installHelp = {
	description: t("cli.commandHelp.installOrLinkAnExtensionPackage"),
} satisfies CommandMetadata;

export const modelsHelp = {
	description: t("cli.commandHelp.listSearchAndRefreshAvailableModels"),
} satisfies CommandMetadata;

export const pluginHelp = {
	description: t("cli.commandHelp.managePluginsInstallUninstallListEtc"),
} satisfies CommandMetadata;

export const playHelp = {
	description: t("cli.commandHelp.replayARecordSessionRecordingIn"),
} satisfies CommandMetadata;

export const psHelp = {
	description: t("cli.ps.description"),
} satisfies CommandMetadata;

export const readHelp = {
	description: t("cli.commandHelp.showWhatTheReadToolWill"),
} satisfies CommandMetadata;
export const renderHelp = {
	description: t("cli.commandHelp.drawASessionSEntireThread"),
} satisfies CommandMetadata;

export const searchHelp = { description: t("cli.commandHelp.testWebSearchProviders") } satisfies CommandMetadata;

export const shareHelp = {
	description: t("cli.commandHelp.shareASavedSessionViaAn"),
} satisfies CommandMetadata;

export const setupHelp = {
	description: t("cli.commandHelp.runOnboardingSetupOrInstallDependencies"),
} satisfies CommandMetadata;

export const shellHelp = { description: t("cli.commandHelp.interactiveShellConsole") } satisfies CommandMetadata;

export const skillHelp = {
	description: t("cli.commandHelp.installSearchPublishAndManageSkills"),
} satisfies CommandMetadata;

export const sshHelp = { description: t("cli.commandHelp.manageSshHostConfigurations") } satisfies CommandMetadata;

export const statsHelp = { description: t("cli.commandHelp.viewUsageStatistics") } satisfies CommandMetadata;

export const tinyModelsHelp = {
	description: t("cli.commandHelp.downloadTinyLocalModelsSessionTitles"),
} satisfies CommandMetadata;

export const tokenHelp = { description: t("cli.commandHelp.getTheApiKeyOrOauth") } satisfies CommandMetadata;

export const toksHelp = {
	description: t("cli.commandHelp.countAFileOrTextWith"),
} satisfies CommandMetadata;

export const ttsrHelp = {
	description: t("cli.commandHelp.inspectAndTestTimeTravelingStream"),
} satisfies CommandMetadata;

export const updateHelp = { description: t("cli.commandHelp.checkForAndInstallUpdates") } satisfies CommandMetadata;

export const usageHelp = {
	description: t("cli.commandHelp.showProviderUsageLimitsForEvery"),
} satisfies CommandMetadata;

export const worktreeHelp = {
	description: t("cli.commandHelp.addListOrClearGitWorktrees"),
} satisfies CommandMetadata;
