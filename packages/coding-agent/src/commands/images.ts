/** Inspect and maintain image publication backends. */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { imagesHelp as commandHelp } from "../cli/command-help";
import { IMAGES_ACTIONS, type ImagesAction, type ImagesCommandArgs, runImagesCommand } from "../cli/images-cli";
import { t } from "@oh-my-pi/pi-i18n";

export default class Images extends Command {
	static description = commandHelp.description;
	static aliases = ["img"];
	static args = {
		action: Args.string({
			description: t("cli.images.statusDefaultDoctorProbeOrPurge"),
			required: false,
			options: [...IMAGES_ACTIONS],
		}),
	};
	static flags = {
		json: Flags.boolean({ description: t("cli.images.outputOneJsonDocument") }),
		apply: Flags.boolean({ description: t("cli.images.applyPurgeDeletionsDefaultIsDry") }),
		all: Flags.boolean({ description: t("cli.images.purgeAllEntriesInsteadOfExpired") }),
		dir: Flags.string({ description: t("cli.images.projectDirectoryDefaultCurrentDirectory") }),
		timeout: Flags.integer({ description: t("cli.images.externalHealthProbeTimeoutInSeconds") }),
	};
	static examples = [
		"omp images",
		"omp images status --json",
		"omp images doctor",
		"omp images probe --timeout 15",
		"omp images purge",
		"omp images purge --all --apply",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Images);
		const command: ImagesCommandArgs = {
			action: (args.action ?? "status") as ImagesAction,
			flags: {
				json: flags.json,
				apply: flags.apply,
				all: flags.all,
				dir: flags.dir,
				timeout: flags.timeout,
			},
		};
		const result = await runImagesCommand(command);
		if (result.exitCode !== 0) process.exitCode = result.exitCode;
	}
}
