/**
 * Keyboard shortcuts sheet of the git TUI (`?`).
 *
 * The keys are the git TUI's own (see `git-tui.ts` and `sidebar.ts`); this
 * sheet only lists them. ANSI draws grouped `key  description` rows; the
 * native render is the hotkeys sheet (NATIVE_REDESIGN §9.7): a glass sheet
 * titled "Keyboard shortcuts" with one section per group and a two-column
 * table whose key cells carry the `key` span token, so Tern draws keycaps.
 */
import { t } from "@oh-my-pi/pi-i18n";
import { formatKeyHint } from "../../app-keybindings";
import type { KeyName } from "../../key-hint-format";
import { matchesKey } from "../../keys";
import { col, node, span } from "../../native/describe";
import type { NativeNode } from "../../native/node";
import { theme } from "../../theme/theme";
import type { Component } from "../../tui";
import { truncateToWidth, visibleWidth } from "../../utils";

interface Shortcut {
	readonly keys: readonly KeyName[];
	readonly label: string;
}

/** Shortcut groups; titles and labels resolve through t() per call, not at module load. */
function shortcutGroups(): readonly { readonly title: string; readonly rows: readonly Shortcut[] }[] {
	return [
		{
			title: t("tui.gitHelp.group.move"),
			rows: [
				{ keys: ["up", "down"], label: t("tui.gitHelp.shortcut.moveSelection") },
				{ keys: ["left", "right"], label: t("tui.gitHelp.shortcut.foldSection") },
				{ keys: ["enter"], label: t("tui.gitHelp.shortcut.openFile") },
				{ keys: ["tab"], label: t("tui.gitHelp.shortcut.switchPane") },
				{ keys: ["]", "["], label: t("tui.gitHelp.shortcut.nextFile") },
				{ keys: ["alt+down", "alt+up"], label: t("tui.gitHelp.shortcut.nextChange") },
				{ keys: ["g", "shift+g"], label: t("tui.gitHelp.shortcut.firstLastRow") },
			],
		},
		{
			title: t("tui.gitHelp.group.stage"),
			rows: [
				{ keys: ["space"], label: t("tui.gitHelp.shortcut.toggleRow") },
				{ keys: ["s", "u"], label: t("tui.gitHelp.shortcut.toggleHunk") },
				{ keys: ["shift+up", "shift+down"], label: t("tui.gitHelp.shortcut.selectLines") },
				{ keys: ["x"], label: t("tui.gitHelp.shortcut.discardHunk") },
				{ keys: ["delete"], label: t("tui.gitHelp.shortcut.discardFile") },
			],
		},
		{
			title: t("tui.gitHelp.group.view"),
			rows: [
				{ keys: ["v"], label: t("tui.gitHelp.shortcut.cycleView") },
				{ keys: ["1", "2", "3", "4"], label: t("tui.gitHelp.shortcut.pickView") },
				{ keys: ["w"], label: t("tui.gitHelp.shortcut.wrapLines") },
				{ keys: ["b"], label: t("tui.gitHelp.shortcut.ignoreWhitespace") },
				{ keys: ["t"], label: t("tui.gitHelp.shortcut.treeToggle") },
				{ keys: ["r"], label: t("tui.gitHelp.shortcut.refresh") },
			],
		},
		{
			title: t("tui.gitHelp.group.commit"),
			rows: [
				{ keys: ["c"], label: t("tui.gitHelp.shortcut.writeCommit") },
				{ keys: ["escape"], label: t("tui.gitHelp.shortcut.leaveField") },
				{ keys: ["q"], label: t("tui.gitHelp.shortcut.quit") },
			],
		},
	];
}

/** The shortcuts overlay; any of `?`, escape or `q` closes it. */
export class GitHelpSheet implements Component {
	readonly nativeOverlay = { role: "omp.overlay.hotkeys", head: t("tui.gitHelp.sheet.head"), size: "lg" } as const;
	readonly #close: () => void;
	#native: NativeNode | undefined;

	constructor(close: () => void) {
		this.#close = close;
	}

	handleInput(data: string): void {
		if (data === "?" || data === "q" || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) this.#close();
	}

	describe(): NativeNode {
		this.#native ??= col(
			shortcutGroups().map(group =>
				node(
					"section",
					{ head: group.title, role: "omp.hotkeys.group" },
					[
						node("table", {
							role: "omp.hotkeys.table",
							cols: [
								{ id: "keys", head: t("tui.gitHelp.column.keys") },
								{ id: "does", head: t("tui.gitHelp.column.action"), grow: 1 },
							],
							rows: group.rows.map((row, index) => ({
								id: String(index),
								cells: { keys: row.keys.map(key => span(formatKeyHint(key), "key")), does: row.label },
							})),
						}),
					],
					group.title,
				),
			),
			{ gap: "lg", role: "omp.app.git.help" },
		);
		return this.#native;
	}

	render(width: number): readonly string[] {
		const groups = shortcutGroups();
		const keyWidth = Math.max(
			...groups.flatMap(group => group.rows.map(row => visibleWidth(row.keys.map(formatKeyHint).join(" ")))),
		);
		const lines = [truncateToWidth(` ${theme.bold(t("tui.gitHelp.sheet.head"))}`, width), ""];
		for (const group of groups) {
			lines.push(truncateToWidth(` ${theme.fg("muted", group.title)}`, width));
			for (const row of group.rows) {
				const keys = row.keys.map(formatKeyHint).join(" ");
				const pad = " ".repeat(Math.max(1, keyWidth - visibleWidth(keys) + 2));
				lines.push(truncateToWidth(`   ${theme.fg("accent", keys)}${pad}${row.label}`, width));
			}
			lines.push("");
		}
		lines.push(
			truncateToWidth(` ${theme.fg("dim", `${formatKeyHint("escape")} ${t("tui.gitHelp.hint.close")}`)}`, width),
		);
		return lines;
	}

	invalidate(): void {
		this.#native = undefined;
	}
}
