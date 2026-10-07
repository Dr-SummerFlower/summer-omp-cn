/**
 * `omp browser-relay` — drive the user's own Chrome tabs.
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import {
	BROWSER_RELAY_ACTIONS,
	type BrowserRelayAction,
	DEFAULT_RELAY_PORT,
	runBrowserRelayCommand,
} from "../cli/browser-relay-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class BrowserRelay extends Command {
	static description = t("cli.commandHelp.runTheLocalCdpRelayThat");

	static args = {
		action: Args.string({
			description: t("cli.browserRelay.actionBrowserRelayActionsJoinDefault", {
				arg: BROWSER_RELAY_ACTIONS.join(" | "),
			}),
			options: [...BROWSER_RELAY_ACTIONS],
			required: false,
		}),
	};

	static flags = {
		port: Flags.integer({
			char: "p",
			description: t("cli.browserRelay.portToListenOn"),
			default: DEFAULT_RELAY_PORT,
		}),
		token: Flags.string({ description: t("cli.browserRelay.requireTheExtensionToPresentThis") }),
		dir: Flags.string({
			description: t("cli.browserRelay.extensionInstallDirectoryInstallDefaultOmp"),
		}),
		"no-group": Flags.boolean({
			description: t("cli.browserRelay.donTGatherControllableTabsInto"),
			default: false,
		}),
		verbose: Flags.boolean({
			char: "v",
			description: t("cli.browserRelay.logRelayTrafficSummariesToStderr"),
			default: false,
		}),
	};

	static examples = [
		"omp browser-relay install    # write the Chrome extension to disk + setup steps",
		"omp browser-relay            # serve the relay on the default port",
		"omp browser-relay -p 9333 --token s3cret",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(BrowserRelay);
		await runBrowserRelayCommand({
			action: (args.action as BrowserRelayAction | undefined) ?? "serve",
			port: flags.port,
			token: flags.token,
			dir: flags.dir,
			group: !flags["no-group"],
			verbose: flags.verbose,
		});
	}
}
