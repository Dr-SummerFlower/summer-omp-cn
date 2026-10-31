/**
 * Rebind the active memory backend after an explicit cwd move.
 *
 * Only Mnemopi keeps cwd-scoped state that must be rebuilt for the destination;
 * the local/sharpshooter backends read their scope lazily and need no rebuild.
 */

import type { AgentSession } from "../session/agent-session";
import { cfgMemoryBackend } from "./settings";

export async function rebindMemoryBackendForCwd(session: AgentSession): Promise<void> {
	if (!session.memoryEnabled) return;
	await session.settleMemoryBackend();
	// The manager already has the new cwd, and this may also be rollback from a
	// destination that never committed. Drain existing writes without capturing
	// the transcript under either transient scope.
	await session.applyMemoryBackend({ retainMnemopi: false });

	// Startup is best-effort, but a move must not commit an unusable memory backend.
	if (cfgMemoryBackend.get(session.settings) === "mnemopi" && !session.getMnemopiSessionState()) {
		throw new Error("Mnemopi backend failed to initialise for the destination cwd.");
	}
}
