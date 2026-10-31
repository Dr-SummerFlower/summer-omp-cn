import { afterEach, describe, expect, it } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	type CfgAppliedChange,
	type CfgChangeRequest,
	CfgProtocolHandler,
	setCfgApprovalHost,
} from "@oh-my-pi/pi-coding-agent/internal-urls/cfg-protocol";
import { parseInternalUrl } from "@oh-my-pi/pi-coding-agent/internal-urls/parse";
import type { ToolSession } from "@oh-my-pi/pi-coding-agent/tools";

import { cfgEditFuzzyMatch, cfgEditMode } from "@oh-my-pi/pi-coding-agent/edit/settings";
import { cfgModelRoles } from "@oh-my-pi/pi-coding-agent/config/model-settings";
import { cfgSearxngEndpoint } from "@oh-my-pi/pi-coding-agent/web/settings";
import type { InternalWriteResult } from "@oh-my-pi/pi-coding-agent/internal-urls/types";

function sessionWith(settings: Settings, caller: Partial<ToolSession> = {}): ToolSession {
	return { settings, hasUI: true, settingsApproval: true, taskDepth: 0, ...caller } as unknown as ToolSession;
}

const handler = new CfgProtocolHandler();
const read = (url: string, settings: Settings) =>
	handler.resolve(parseInternalUrl(url), { session: sessionWith(settings) });
const write = (url: string, content: string, settings: Settings, caller?: Partial<ToolSession>) =>
	handler.write(parseInternalUrl(url), content, { session: sessionWith(settings, caller) });
const textOf = (result: InternalWriteResult) => (result.content[0]?.type === "text" ? result.content[0].text : "");

describe("CfgProtocolHandler", () => {
	afterEach(() => setCfgApprovalHost(null));

	it("lists a namespace relative to its prefix and a setting with its source", async () => {
		const settings = Settings.isolated({ "edit.mode": "replace" });

		const namespace = await read("cfg://edit", settings);
		expect(namespace.content).toContain('mode: "replace"');
		expect(namespace.content).not.toContain("edit:");
		expect(namespace.details?.cfg).toMatchObject({ path: "edit", modified: 1 });

		const leaf = await read("cfg://Edit.Mode", settings);
		expect(leaf.content).toStartWith('edit.mode: "replace"');
		expect(leaf.content).toContain("source: session override");
	});

	it("redacts credential values", async () => {
		const settings = Settings.isolated({ "auth.broker.token": "sekrit" });
		const resource = await read("cfg://auth", settings);
		expect(resource.content).toContain("token: <redacted>");
		expect(resource.content).not.toContain("sekrit");
	});

	it("refuses writes when no host can ask the user", async () => {
		const settings = Settings.isolated();
		await expect(write("cfg://edit/fuzzyMatch", "false", settings)).rejects.toThrow("requires user approval");
		expect(cfgEditFuzzyMatch.get(settings)).toBe(true);
	});

	it("refuses subagent and headless writes without prompting the user", async () => {
		const settings = Settings.isolated();
		const asked: CfgChangeRequest[] = [];
		setCfgApprovalHost({
			approve: async request => (asked.push(request), "once"),
			applied: () => {},
			persistentSettings: settings,
		});

		await expect(write("cfg://edit/fuzzyMatch", "false", settings, { taskDepth: 1 })).rejects.toThrow(
			"Subagents cannot change settings",
		);
		await expect(write("cfg://edit/fuzzyMatch/save", "false", settings, { settingsApproval: false })).rejects.toThrow(
			"no interactive UI",
		);
		expect(asked).toEqual([]);
		expect(cfgEditFuzzyMatch.get(settings)).toBe(true);
	});

	it("applies a session change only after approval and leaves disk untouched", async () => {
		const settings = Settings.isolated();
		const persistent = Settings.isolated();
		const asked: CfgChangeRequest[] = [];
		const applied: CfgAppliedChange[] = [];
		let allow = false;
		setCfgApprovalHost({
			approve: async request => (asked.push(request), allow ? "once" : "deny"),
			applied: change => applied.push(change),
			persistentSettings: persistent,
		});

		const declined = await write("cfg://edit/fuzzyMatch", "false", settings);
		expect(declined.details?.cfg?.outcome).toBe("declined");
		expect(cfgEditFuzzyMatch.get(settings)).toBe(true);
		expect(applied).toEqual([]);

		allow = true;
		const result = await write("cfg://edit/fuzzyMatch", "false", settings);
		expect(result.details?.cfg?.outcome).toBe("applied");
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("cfg://edit/fuzzyMatch/save");
		// The host must learn about the change to start components that read it once.
		expect(applied).toEqual([{ path: "edit.fuzzyMatch", value: false, settings, save: false }]);
		expect(cfgEditFuzzyMatch.get(settings)).toBe(false);
		expect(cfgEditFuzzyMatch.isConfigured(persistent)).toBe(false);
		expect(asked).toEqual([
			{ path: "edit.fuzzyMatch", previous: "true", value: "false", save: false },
			{ path: "edit.fuzzyMatch", previous: "true", value: "false", save: false },
		]);
	});

	it("stops asking for the rest of the session once the user allows it always", async () => {
		const settings = Settings.isolated();
		const asked: CfgChangeRequest[] = [];
		setCfgApprovalHost({
			approve: async request => (asked.push(request), "session"),
			applied: () => {},
			persistentSettings: settings,
		});
		const inSession = (sessionId: string) => ({ getSessionId: () => sessionId });

		await write("cfg://edit/fuzzyMatch", "false", settings, inSession("a"));
		await write("cfg://edit/mode", '"replace"', settings, inSession("a"));
		expect(cfgEditMode.get(settings)).toBe("replace");
		expect(asked.map(request => request.path)).toEqual(["edit.fuzzyMatch"]);

		// A session-change grant does not cover persisting to config.yml ...
		await write("cfg://edit/mode/save", '"patch"', settings, inSession("a"));
		// ... but the grant given on the save prompt covers later saves.
		await write("cfg://edit/fuzzyMatch/save", "true", settings, inSession("a"));
		expect(cfgEditFuzzyMatch.get(settings)).toBe(true);
		// Nor does any grant carry over to another session.
		await write("cfg://edit/mode", '"hashline"', settings, inSession("b"));
		expect(asked.map(request => [request.path, request.save])).toEqual([
			["edit.fuzzyMatch", false],
			["edit.mode", true],
			["edit.mode", false],
		]);
	});

	it("fails an unanswered write without changing anything and asks again next time", async () => {
		const settings = Settings.isolated();
		let answer: "timeout" | "once" = "timeout";
		setCfgApprovalHost({ approve: async () => answer, applied: () => {}, persistentSettings: settings });

		await expect(write("cfg://edit/fuzzyMatch", "false", settings)).rejects.toThrow();
		expect(cfgEditFuzzyMatch.get(settings)).toBe(true);

		answer = "once";
		const retried = await write("cfg://edit/fuzzyMatch", "false", settings);
		expect(retried.details?.cfg?.outcome).toBe("applied");
	});

	it("refuses a session change an environment variable overrides without asking the user", async () => {
		const settings = Settings.isolated();
		const asked: CfgChangeRequest[] = [];
		setCfgApprovalHost({
			approve: async request => (asked.push(request), "once"),
			applied: () => {},
			persistentSettings: Settings.isolated(),
		});
		const previous = Bun.env.PI_EDIT_FUZZY;
		Bun.env.PI_EDIT_FUZZY = "1";
		try {
			await expect(write("cfg://edit/fuzzyMatch", "false", settings)).rejects.toThrow("PI_EDIT_FUZZY");
			expect(asked).toEqual([]);
			expect(cfgEditFuzzyMatch.provenance(settings)).toBe("env");
			expect(cfgEditFuzzyMatch.get(settings)).toBe(true);
		} finally {
			if (previous === undefined) delete Bun.env.PI_EDIT_FUZZY;
			else Bun.env.PI_EDIT_FUZZY = previous;
		}
	});

	it("asks normally for writes a fallback environment variable only defaults", async () => {
		const settings = Settings.isolated();
		const asked: CfgChangeRequest[] = [];
		setCfgApprovalHost({
			approve: async request => (asked.push(request), "once"),
			applied: () => {},
			persistentSettings: settings,
		});
		const previous = Bun.env.SEARXNG_ENDPOINT;
		Bun.env.SEARXNG_ENDPOINT = "http://env.example";
		try {
			const session = await write("cfg://searxng/endpoint", '"http://session.example"', settings);
			expect(session.details?.cfg).toMatchObject({ outcome: "applied" });
			expect(cfgSearxngEndpoint.get(settings)).toBe("http://session.example");

			await write("cfg://searxng/endpoint/save", '"http://saved.example"', settings);
			expect(cfgSearxngEndpoint.get(settings)).toBe("http://saved.example");
			expect(asked).toHaveLength(2);
			expect(asked.map(request => request.shadowedBy)).toEqual([undefined, undefined]);
		} finally {
			if (previous === undefined) delete Bun.env.SEARXNG_ENDPOINT;
			else Bun.env.SEARXNG_ENDPOINT = previous;
		}
	});

	it("reports a partial record write as applied, since layers deep-merge", async () => {
		const settings = Settings.isolated();
		cfgModelRoles.set(settings, { default: "anthropic/a" });
		setCfgApprovalHost({ approve: async () => "once", applied: () => {}, persistentSettings: settings });

		const session = await write("cfg://modelRoles", '{"smol":"anthropic/b"}', settings);
		expect(session.details?.cfg?.outcome).toBe("applied");
		expect(session.details?.cfg?.effective).toBeUndefined();
		expect(textOf(session)).toContain("cfg://modelRoles/save");

		const saved = await write("cfg://modelRoles/save", '{"smol":"anthropic/c"}', settings);
		expect(saved.details?.cfg?.effective).toBeUndefined();
		expect(textOf(saved)).not.toContain("Effective value is still");
		expect(cfgModelRoles.get(settings)).toMatchObject({ smol: "anthropic/c" });
	});

	it("reports a saved value a project layer still overrides", async () => {
		const settings = Settings.isolated();
		settings.setProjectModelRole("default", "anthropic/project");
		const asked: CfgChangeRequest[] = [];
		setCfgApprovalHost({
			approve: async request => (asked.push(request), "once"),
			applied: () => {},
			persistentSettings: settings,
		});

		const shadowed = await write("cfg://modelRoles/save", '{"default":"anthropic/global"}', settings);
		expect(asked[0]?.shadowedBy).toContain("project config");
		expect(shadowed.details?.cfg?.effective).toContain("anthropic/project");
		expect(textOf(shadowed)).toContain("project config takes precedence");

		// A key the project layer does not set applies despite the layer owning the record.
		const applied = await write("cfg://modelRoles/save", '{"smol":"anthropic/global"}', settings);
		expect(asked[1]?.shadowedBy).toBeUndefined();
		expect(applied.details?.cfg?.effective).toBeUndefined();

		// Replacing a key the global config supplies is not shadowed, though the project layer owns the record.
		await write("cfg://modelRoles/save", '{"smol":"anthropic/next"}', settings);
		expect(asked[2]?.shadowedBy).toBeUndefined();
		expect(cfgModelRoles.get(settings)).toMatchObject({ default: "anthropic/project", smol: "anthropic/next" });
	});

	it("persists /save writes to the host settings and mirrors them into a separate session instance", async () => {
		const settings = Settings.isolated();
		const persistent = Settings.isolated();
		const applied: Settings[] = [];
		setCfgApprovalHost({
			approve: async () => "once",
			applied: change => applied.push(change.settings),
			persistentSettings: persistent,
		});

		await write("cfg://edit/mode/save", '"replace"', settings);
		expect(cfgEditMode.get(persistent)).toBe("replace");
		expect(cfgEditMode.provenance(persistent)).toBe("global");
		expect(cfgEditMode.get(settings)).toBe("replace");
		expect(applied).toHaveLength(2);
		expect(applied[0]).toBe(persistent);
		expect(applied[1]).toBe(settings);
	});

	it("rejects namespace targets and values outside the schema before asking", async () => {
		const settings = Settings.isolated();
		const asked: CfgChangeRequest[] = [];
		setCfgApprovalHost({
			approve: async request => (asked.push(request), "once"),
			applied: () => {},
			persistentSettings: settings,
		});

		await expect(write("cfg://edit", "true", settings)).rejects.toThrow("is a namespace");
		await expect(write("cfg://edit/mode", '"bogus"', settings)).rejects.toThrow("Valid values:");
		await expect(write("cfg://edi/mode", '"replace"', settings)).rejects.toThrow("Similar: edit.mode");
		expect(asked).toEqual([]);
	});
});
