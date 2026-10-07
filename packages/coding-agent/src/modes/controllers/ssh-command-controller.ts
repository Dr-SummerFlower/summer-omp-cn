/**
 * SSH Command Controller
 *
 * Handles /ssh subcommands for managing SSH host configurations.
 */
import { getProjectDir, getSSHConfigPath } from "@oh-my-pi/pi-utils";
import { reset as resetCapabilities } from "../../capability";
import { type SSHHost, sshCapability } from "../../capability/ssh";
import { loadCapability } from "../../discovery";
import { t } from "@oh-my-pi/pi-i18n";
import { addSSHHost, readSSHConfigFile, removeSSHHost, type SSHHostConfig } from "../../ssh/config-writer";
import { parseCommandArgs } from "../../utils/command-args";
import { theme } from "@oh-my-pi/pi-tui/theme";
import type { InteractiveModeContext } from "../types";
import {
	groupBySource,
	parseRemoveArgs,
	readScopeFlag,
	type ScopeValue,
	showCommandMessage,
} from "./command-controller-shared";

export class SSHCommandController {
	constructor(private ctx: InteractiveModeContext) {}

	/**
	 * Handle /ssh command and route to subcommands
	 */
	async handle(text: string): Promise<void> {
		const parts = text.trim().split(/\s+/);
		const subcommand = parts[1]?.toLowerCase();

		if (!subcommand || subcommand === "help") {
			this.#showHelp();
			return;
		}

		switch (subcommand) {
			case "add":
				await this.#handleAdd(text);
				break;
			case "list":
				await this.#handleList();
				break;
			case "remove":
			case "rm":
				await this.#handleRemove(text);
				break;
			default:
				this.ctx.showError(t("slash.ssh.unknownSubcommand", { subcommand }));
		}
	}

	/**
	 * Show help text
	 */
	#showHelp(): void {
		const helpText = [
			"",
			theme.bold(t("slash.ssh.help.title")),
			"",
			t("slash.ssh.help.description"),
			"",
			theme.fg("accent", t("slash.ssh.help.commands")),
			t("slash.ssh.help.commandsBody"),
			"",
		].join("\n");

		this.#showMessage(helpText);
	}

	/**
	 * Handle /ssh add - parse flags and add host to config
	 */
	async #handleAdd(text: string): Promise<void> {
		const prefixMatch = text.match(/^\/ssh\s+add\b\s*(.*)$/i);
		const rest = prefixMatch?.[1]?.trim() ?? "";
		if (!rest) {
			this.ctx.showError(t("slash.ssh.add.usage"));
			return;
		}

		const tokens = parseCommandArgs(rest);
		if (tokens.length === 0) {
			this.ctx.showError(t("slash.ssh.add.usage"));
			return;
		}

		let name: string | undefined;
		let scope: ScopeValue = "project";
		let host: string | undefined;
		let username: string | undefined;
		let port: number | undefined;
		let keyPath: string | undefined;
		let description: string | undefined;
		let compat = false;

		let i = 0;
		if (!tokens[0].startsWith("-")) {
			name = tokens[0];
			i = 1;
		}

		while (i < tokens.length) {
			const argToken = tokens[i];
			if (argToken === "--host") {
				const value = tokens[i + 1];
				if (!value) {
					this.ctx.showError(t("slash.ssh.add.missingValue", { flag: "--host" }));
					return;
				}
				host = value;
				i += 2;
				continue;
			}
			if (argToken === "--user") {
				const value = tokens[i + 1];
				if (!value) {
					this.ctx.showError(t("slash.ssh.add.missingValue", { flag: "--user" }));
					return;
				}
				username = value;
				i += 2;
				continue;
			}
			if (argToken === "--port") {
				const value = tokens[i + 1];
				if (!value) {
					this.ctx.showError(t("slash.ssh.add.missingValue", { flag: "--port" }));
					return;
				}
				const parsed = Number.parseInt(value, 10);
				if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
					this.ctx.showError(t("slash.ssh.add.invalidPort"));
					return;
				}
				port = parsed;
				i += 2;
				continue;
			}
			if (argToken === "--key") {
				const value = tokens[i + 1];
				if (!value) {
					this.ctx.showError(t("slash.ssh.add.missingValue", { flag: "--key" }));
					return;
				}
				keyPath = value;
				i += 2;
				continue;
			}
			if (argToken === "--desc") {
				const value = tokens[i + 1];
				if (!value) {
					this.ctx.showError(t("slash.ssh.add.missingValue", { flag: "--desc" }));
					return;
				}
				description = value;
				i += 2;
				continue;
			}
			if (argToken === "--compat") {
				compat = true;
				i += 1;
				continue;
			}
			if (argToken === "--scope") {
				const r = readScopeFlag(tokens[i + 1]);
				if (!r.ok) {
					this.ctx.showError(r.error);
					return;
				}
				scope = r.scope;
				i += 2;
				continue;
			}
			this.ctx.showError(t("slash.skills.unknownOption", { option: argToken }));
			return;
		}

		if (!name) {
			this.ctx.showError(t("slash.ssh.add.nameRequired"));
			return;
		}

		if (!host) {
			this.ctx.showError(t("slash.ssh.add.hostRequired"));
			return;
		}

		try {
			const cwd = getProjectDir();
			const filePath = getSSHConfigPath(scope, cwd);

			const hostConfig: SSHHostConfig = { host };
			if (username) hostConfig.username = username;
			if (port) hostConfig.port = port;
			if (keyPath) hostConfig.keyPath = keyPath;
			if (description) hostConfig.description = description;
			if (compat) hostConfig.compat = true;

			await addSSHHost(filePath, name, hostConfig);
			resetCapabilities();

			const scopeLabel = scope === "user" ? "user" : "project";
			const lines = [
				"",
				theme.fg("success", t("slash.ssh.add.added", { name, scope: scopeLabel })),
				"",
				t("slash.ssh.add.hostLine", { host }),
			];
			if (username) lines.push(t("slash.ssh.add.userLine", { user: username }));
			if (port) lines.push(t("slash.ssh.add.portLine", { port }));
			if (keyPath) lines.push(t("slash.ssh.add.keyLine", { key: keyPath }));
			if (description) lines.push(t("slash.ssh.add.descLine", { desc: description }));
			if (compat) lines.push(t("slash.ssh.add.compatLine"));
			lines.push("");
			lines.push(theme.fg("muted", t("slash.ssh.add.runListTip", { list: theme.fg("accent", "/ssh list") })));
			lines.push("");

			this.#showMessage(lines.join("\n"));
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			let helpText = "";
			if (errorMsg.includes("already exists")) {
				helpText = `\n\n${t("slash.ssh.alreadyExists.tipPrefix")} ${theme.fg("accent", "/ssh remove")}${t(
					"slash.ssh.alreadyExists.tipSuffix",
				)}`;
			}

			this.ctx.showError(t("slash.ssh.add.failed", { error: errorMsg }) + helpText);
		}
	}

	/**
	 * Handle /ssh list - show all configured SSH hosts
	 */
	async #handleList(): Promise<void> {
		try {
			const cwd = getProjectDir();

			// Load from both user and project configs
			const userPath = getSSHConfigPath("user", cwd);
			const projectPath = getSSHConfigPath("project", cwd);

			const [userConfig, projectConfig] = await Promise.all([
				readSSHConfigFile(userPath),
				readSSHConfigFile(projectPath),
			]);

			const userHosts = Object.keys(userConfig.hosts ?? {});
			const projectHosts = Object.keys(projectConfig.hosts ?? {});

			// Load discovered hosts via capability system
			const configHostNames = new Set([...userHosts, ...projectHosts]);
			let discoveredHosts: SSHHost[] = [];
			try {
				const result = await loadCapability<SSHHost>(sshCapability.id, { cwd });
				discoveredHosts = result.items.filter(h => !configHostNames.has(h.name));
			} catch {
				// Ignore discovery errors
			}

			if (userHosts.length === 0 && projectHosts.length === 0 && discoveredHosts.length === 0) {
				this.#showMessage(
					[
						"",
						theme.fg("muted", t("slash.ssh.list.empty")),
						"",
						t("slash.ssh.list.emptyTip", { add: theme.fg("accent", "/ssh add") }),
						"",
					].join("\n"),
				);
				return;
			}

			const lines: string[] = ["", theme.bold(t("slash.ssh.list.title")), ""];

			// Show user-level hosts
			if (userHosts.length > 0) {
				lines.push(
					theme.fg("accent", t("slash.ssh.list.userLevel")) + theme.fg("muted", t("slash.ssh.list.userLevelPath")),
				);
				for (const name of userHosts) {
					const config = userConfig.hosts![name];
					const details = this.#formatHostDetails(config);
					lines.push(`  ${theme.fg("accent", name)} ${details}`);
				}
				lines.push("");
			}

			// Show project-level hosts
			if (projectHosts.length > 0) {
				lines.push(
					theme.fg("accent", t("slash.ssh.list.projectLevel")) +
						theme.fg("muted", t("slash.ssh.list.projectLevelPath")),
				);
				for (const name of projectHosts) {
					const config = projectConfig.hosts![name];
					const details = this.#formatHostDetails(config);
					lines.push(`  ${theme.fg("accent", name)} ${details}`);
				}
				lines.push("");
			}

			// Show discovered hosts (from ssh.json, .ssh.json in project root, etc.)
			if (discoveredHosts.length > 0) {
				for (const { providerName, shortPath, items: hosts } of groupBySource(discoveredHosts, h => h._source)) {
					lines.push(
						theme.fg("accent", t("slash.ssh.list.discovered")) +
							theme.fg(
								"muted",
								t("slash.ssh.list.discoveredSource", { provider: providerName, path: shortPath }),
							) +
							theme.fg("dim", t("slash.ssh.list.readOnly")),
					);
					for (const host of hosts) {
						const details = this.#formatHostDetails({
							host: host.host,
							username: host.username,
							port: host.port,
						});
						lines.push(`  ${theme.fg("accent", host.name)} ${details}`);
					}
					lines.push("");
				}
			}

			this.#showMessage(lines.join("\n"));
		} catch (error) {
			this.ctx.showError(
				t("slash.ssh.list.failed", { error: error instanceof Error ? error.message : String(error) }),
			);
		}
	}

	/**
	 * Format host details (host, user, port) for display
	 */
	#formatHostDetails(config: { host?: string; username?: string; port?: number }): string {
		const parts: string[] = [];
		if (config.host) parts.push(config.host);
		if (config.username) parts.push(t("slash.ssh.list.detailUser", { user: config.username }));
		if (config.port && config.port !== 22) parts.push(t("slash.ssh.list.detailPort", { port: config.port }));
		return theme.fg("dim", parts.length > 0 ? `[${parts.join(", ")}]` : "");
	}

	/**
	 * Handle /ssh remove <name> - remove a host from config
	 */
	async #handleRemove(text: string): Promise<void> {
		const match = text.match(/^\/ssh\s+(?:remove|rm)\b\s*(.*)$/i);
		const rest = match?.[1]?.trim() ?? "";
		const parsed = parseRemoveArgs(rest);
		if (!parsed.ok) {
			this.ctx.showError(parsed.error);
			return;
		}
		const { name, scope } = parsed.value;
		if (!name) {
			this.ctx.showError(t("slash.ssh.remove.nameRequired"));
			return;
		}

		try {
			const cwd = getProjectDir();
			const filePath = getSSHConfigPath(scope, cwd);
			const config = await readSSHConfigFile(filePath);
			if (!config.hosts?.[name]) {
				this.ctx.showError(t("slash.ssh.remove.notFound", { name, scope }));
				return;
			}

			await removeSSHHost(filePath, name);
			resetCapabilities();

			this.#showMessage(["", theme.fg("success", t("slash.ssh.remove.removed", { name, scope })), ""].join("\n"));
		} catch (error) {
			this.ctx.showError(
				t("slash.ssh.remove.failed", { error: error instanceof Error ? error.message : String(error) }),
			);
		}
	}

	/**
	 * Show a message in the chat
	 */
	#showMessage(text: string): void {
		showCommandMessage(this.ctx, text);
	}
}
