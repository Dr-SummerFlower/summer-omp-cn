import type { InteractiveModeContext } from "../modes/types";
import { SkillshareClient } from "../skillshare/client";
import {
	formatInstalledSkills,
	formatScriptApproval,
	formatSkillChanges,
	formatSkillSearch,
	installSkillPackages,
	listInstalledSkills,
	type SkillChange,
	type SkillInstallHooks,
	updateSkillPackages,
} from "../skillshare/installer";
import { clearSubmittedText } from "./helpers/draft";
import { errorMessage, parseSubcommand } from "./helpers/parse";
import { t } from "@oh-my-pi/pi-i18n";
import type { SlashCommandSpec } from "./types";

function skillsUsage(): string {
	return [
		t("slash.skills.usage.header"),
		t("slash.skills.usage.search"),
		t("slash.skills.usage.install"),
		t("slash.skills.usage.installed"),
		t("slash.skills.usage.update"),
	].join("\n");
}

/** Split `<name…> [--global|-g]`; unknown flags are errors. */
function parseTargets(rest: string): { names: string[]; global: boolean } | { error: string } {
	const names: string[] = [];
	let global = false;
	for (const token of rest.split(/\s+/)) {
		if (!token) continue;
		if (token === "--global" || token === "-g") global = true;
		else if (token.startsWith("-"))
			return { error: `${t("slash.skills.unknownOption", { option: token })}\n\n${skillsUsage()}` };
		else names.push(token);
	}
	return { names, global };
}

async function withClient<T>(run: (client: SkillshareClient) => Promise<T>): Promise<T> {
	const client = await SkillshareClient.create();
	try {
		return await run(client);
	} finally {
		client.close();
	}
}

function tuiHooks(ctx: InteractiveModeContext): SkillInstallHooks {
	return {
		warn: message => ctx.showWarning(message),
		confirmScripts: request => ctx.showHookConfirm(t("slash.skills.confirmScripts"), formatScriptApproval(request)),
	};
}

async function reportChanges(ctx: InteractiveModeContext, changes: SkillChange[]): Promise<void> {
	if (changes.length === 0) {
		ctx.showStatus(t("slash.skills.upToDate"));
		return;
	}
	await ctx.refreshSkillState();
	ctx.showStatus(formatSkillChanges(changes));
}

export const BUILTIN_SKILLS_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "skills",
		icon: "skill",
		get description() {
			return t("slash.skills.description");
		},
		subcommands: [
			{
				name: "search",
				get description() {
					return t("slash.skills.sub.search.description");
				},
				usage: "<query>",
			},
			{
				name: "install",
				get description() {
					return t("slash.skills.sub.install.description");
				},
				usage: "<@scope/name[@range]>… [--global]",
			},
			{
				name: "installed",
				get description() {
					return t("slash.skills.sub.installed.description");
				},
			},
			{
				name: "update",
				get description() {
					return t("slash.skills.sub.update.description");
				},
				usage: "[@scope/name…] [--global]",
			},
		],
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const { ctx } = runtime;
			clearSubmittedText(runtime);
			const { verb, rest } = parseSubcommand(command.args);
			const cwd = ctx.sessionManager.getCwd();
			try {
				switch (verb) {
					case "search": {
						if (!rest) {
							ctx.showError(t("slash.skills.search.usageError"));
							return;
						}
						const response = await withClient(client => client.search(rest));
						ctx.showStatus(formatSkillSearch(response));
						return;
					}
					case "install": {
						const targets = parseTargets(rest);
						if ("error" in targets) {
							ctx.showError(targets.error);
							return;
						}
						if (targets.names.length === 0) {
							ctx.showError(t("slash.skills.install.usageError"));
							return;
						}
						ctx.showStatus(t("slash.skills.installing", { names: targets.names.join(", ") }), { dim: true });
						const changes = await withClient(client =>
							installSkillPackages(
								client,
								{ specs: targets.names, global: targets.global, yes: false, cwd },
								tuiHooks(ctx),
							),
						);
						await reportChanges(ctx, changes);
						return;
					}
					case "installed": {
						ctx.showStatus(formatInstalledSkills(await listInstalledSkills(cwd)));
						return;
					}
					case "update": {
						const targets = parseTargets(rest);
						if ("error" in targets) {
							ctx.showError(targets.error);
							return;
						}
						ctx.showStatus(t("slash.skills.checkingUpdates"), { dim: true });
						const changes = await withClient(client =>
							updateSkillPackages(client, { names: targets.names, global: targets.global, cwd }, tuiHooks(ctx)),
						);
						await reportChanges(ctx, changes);
						return;
					}
					case "":
					case "help":
						ctx.showStatus(skillsUsage());
						return;
					default:
						ctx.showError(`${t("slash.skills.unknownSubcommand", { verb })}\n\n${skillsUsage()}`);
						return;
				}
			} catch (error) {
				ctx.showError(t("slash.skills.error", { message: errorMessage(error) }));
			}
		},
	},
];
