# retain

> Store durable facts through the active long-term memory backend.

## Source
- Entry: `packages/coding-agent/src/tools/memory-retain.ts`
- Model-facing prompt: `packages/coding-agent/src/prompts/tools/retain.md`
- Mnemopi collaborators:
  - `packages/coding-agent/src/mnemopi/backend.ts` — local backend bootstrap, prompt injection, subagent aliasing, enqueue/clear.
  - `packages/coding-agent/src/mnemopi/state.ts` — scoped recall/retain state and local writes.
  - `packages/coding-agent/src/mnemopi/config.ts` — local SQLite path, bank, scoping, provider settings.
  - `packages/mnemopi/src/core/memory.ts` — local memory runtime used by `remember(...)`.

## Registration / Visibility
- Tool metadata: `strict = true`, `loadMode = "discoverable"`. Approval is dynamic: a call with any `scope: "global"` item has `approval = "write"`, because the write reaches every project's recall; otherwise `approval = "read"`, even though successful calls enqueue or perform memory writes.
- The tool is registered only for `memory.backend = "mnemopi"`; it is absent for `"off"` and `"local"`.
- In unrestricted sessions with an explicit tool list, registration auto-includes the shared `recall`/`retain`/`reflect` set. Restricted lists are not widened.
- In an ordinary `tools.xdev` session, discoverable built-ins may be presented as `xd://retain`; an explicitly requested tool remains top-level.
- Execution returns one final result and has no progress callback or cancellation parameter.

## Inputs

| Field | Type | Required | Description |
|---|---|---:|---|
| `items` | `Array<{ content: string; context?: string; scope?: "project" \| "global" }>` | Yes | One or more memories to store. `minItems: 1`. Each item must be self-contained; `context` is optional per-item provenance. `scope` is in the schema and tool description only when `memory.backend = "mnemopi"` and `mnemopi.scoping` is `global` or `per-project-tagged`; omitted means `project`. |

## Outputs
The output depends on the active `memory.backend`.

Mnemopi:
- `content[0].type = "text"`
- `content[0].text = "<count> memory stored."` or `"<count> memories stored."`
- `details = { count: number }`
- The tool invokes local writes synchronously, but `rememberScoped(...)` catches each write failure and returns `undefined`; `retain` ignores that return and still reports the requested count. The response is therefore not a per-item durability receipt.

## Flow
1. `MemoryRetainTool.createIf(...)` exposes the tool when `memory.backend` is `"mnemopi"`.
2. `execute(...)` re-reads `memory.backend` and dispatches to the matching session state.
3. It fetches `session.getMnemopiSessionState()` and throws if the backend was not started;
   - if any item has `scope: "global"`, it resolves `state.getGlobalRetainTarget()` first; under `per-project` scoping that throws `Mnemopi global scope requires global or per-project-tagged scoping.` and nothing in the batch is stored;
   - for each item, it calls `state.rememberScoped(item.content, ...)` with `source: "coding-agent-retain"`, `importance: 0.75`, `scope: "bank"`, `extract: true`, `extractEntities: true`, `veracity: "tool"`, `memoryType: "fact"`, and metadata `{ session_id, cwd, context, tool: "retain" }`;
   - project items go to the scoped retain bank and global items to the global target (passed as `rememberScoped`'s third argument); exact duplicate content in the same session updates the existing working-memory row in the Mnemopi core.

## Modes / Variants
- Mnemopi tool path: direct local `remember(...)` into the scoped retain bank.
- Mnemopi bank scoping from `computeMnemopiBankScope(...)`:
  - `global` — retain and recall use the shared bank; `scope: "global"` writes there too.
  - `per-project` — retain and recall use a project bank derived from the absolute cwd basename plus a hash of that absolute cwd; `scope: "global"` is not offered.
  - `per-project-tagged` — retain writes to the cwd-derived project bank, or to the shared bank for `scope: "global"` items; recall also reads the shared bank.
  - Per-project recall may add safe legacy banks whose stored working-memory rows all match the active cwd; scanning is capped at 64 candidate bank directories.
- Session scope:
  - tool-called retains are per-session work for the active backend;
  - persisted Mnemopi memories are local SQLite data;
  - subagents alias parent memory state.

## Side Effects
- Filesystem
  - Mnemopi: writes to local SQLite under `mnemopi.dbPath`, defaulting beneath the agent memories directory (`mnemopi/mnemopi.db`) with one database file per scoped bank when needed.
- Network
  - Mnemopi: none unless configured embedding or LLM providers make calls during extraction.
- Session state
  - Mnemopi: writes through the session's scoped `Mnemopi` instance, includes `session_id`, `cwd`, and optional `context`, and shares scoped resources with subagents.
- User-visible prompts / interactive UI
  - Mnemopi write failures are logged by `rememberInScope(...)`; the tool response does not expose per-item failures.
- Background work / cancellation
  - Mnemopi fact/entity extraction and embedding may continue after the synchronous row write. Backend `enqueue(...)` requests full consolidation; backend clear disposes scoped instances before deleting their database files.
  - `retain.execute()` itself has no abort-signal handling.

## Limits & Caps
- Input schema requires `items.length >= 1`; item strings have no schema-level minimum length.
- Tool availability requires `memory.backend` to be `"mnemopi"`; default `memory.backend` is `"off"`.
- Mnemopi retain settings:
  - `mnemopi.autoRetain = true`
  - `mnemopi.retainEveryNTurns = 4`
  - `mnemopi.scoping = "per-project"`

## Errors
- Throws `Mnemopi backend is not initialised for this session.` when `memory.backend == "mnemopi"` but no state exists.
- Mnemopi `remember(...)` failures are caught in `MnemopiSessionState.rememberInScope(...)`, logged, and not rethrown to the tool caller.

## Notes
- Mnemopi storage is local SQLite. `mnemopiBackend.clear(...)` removes the database files for every active scoped bank and then rehydrates the backend when the session remains active.
- Mnemopi auto-retain stores prepared transcripts with `source: "coding-agent-transcript"`, `importance: 0.65`, `veracity: "unknown"`, and `memoryType: "episode"`.
- `recall.md` and `reflect.md` rely on the same backend selection and scoping behavior.
