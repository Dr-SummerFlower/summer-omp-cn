/**
 * `omp skill <action>` handlers for local skill discovery.
 */
import { CliUsageError } from "@oh-my-pi/pi-utils/cli";
import { handleSkillList } from "./skill-list";

export type SkillAction = "list";

export const SKILL_ACTIONS: readonly SkillAction[] = ["list"];

export interface SkillCommandArgs {
	action: SkillAction;
	args: string[];
	cwd: string;
	flags: {
		json?: boolean;
	};
}

export const SKILL_USAGE = `Usage: omp skill <action> [...]

  list [dir] [--json]   Skills a session in dir resolves, with warnings
`;

async function dispatch(cmd: SkillCommandArgs): Promise<number> {
	switch (cmd.action) {
		case "list":
			return handleSkillList(cmd.args, cmd.cwd, cmd.flags.json === true);
	}
}

/**
 * Run one `omp skill` action and return the process exit code. Usage mistakes
 * propagate as {@link CliUsageError}; other failures are printed as
 * `skill <action>: <message>` and yield 1.
 */
export async function runSkillCommand(cmd: SkillCommandArgs): Promise<number> {
	try {
		return await dispatch(cmd);
	} catch (error) {
		if (error instanceof CliUsageError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`skill ${cmd.action}: ${message}\n`);
		return 1;
	}
}
