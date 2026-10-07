import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { t } from "@oh-my-pi/pi-i18n";

const APP_NAME = "omp";

export async function initXdg(): Promise<void> {
	if (process.platform !== "linux" && process.platform !== "darwin") {
		console.error(t("cli.initXdg.xdgDirectorySetupIsOnlySupported"));
		process.exit(1);
	}

	const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share");
	const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state");
	const cacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");

	const dirs = [path.join(dataHome, APP_NAME), path.join(stateHome, APP_NAME), path.join(cacheHome, APP_NAME)];

	for (const dir of dirs) {
		await fs.mkdir(dir, { recursive: true });
		console.log(`Created ${dir.replace(os.homedir(), "~")}`);
	}

	console.log(t("cli.initXdg.xdgDirectoriesInitialized"));
	console.log(t("cli.initXdg.ensureXdgDataHomeXdgState"));
	console.log(t("cli.initXdg.areSetInYourShellProfile"));
}
