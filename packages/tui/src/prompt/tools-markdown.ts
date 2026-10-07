import { t } from "@oh-my-pi/pi-i18n";

export interface ToolsMarkdownBindings {
	tools: ReadonlyArray<{ description: string; name: string }>;
	/** Tools mounted under `xd://` URLs, listed after the active set. */
	xdevTools?: ReadonlyArray<{ name: string; summary: string }>;
}

function escapeTableCell(value: string): string {
	return value
		.replace(/\|/g, "\\|")
		.replace(/\r?\n+/g, " ")
		.trim();
}

export function buildToolsMarkdown(bindings: ToolsMarkdownBindings): string {
	if (bindings.tools.length === 0 && !bindings.xdevTools?.length) {
		return t("tui.toolsMarkdown.empty.noTools");
	}

	const rows: string[] = [];
	for (const tool of bindings.tools) {
		const description = escapeTableCell(tool.description) || t("tui.toolsMarkdown.cell.noDescription");
		rows.push(`| \`${tool.name}\` | ${description} |`);
	}
	for (const mounted of bindings.xdevTools ?? []) {
		rows.push(
			`| \`xd://${mounted.name}\` | ${escapeTableCell(mounted.summary) || t("tui.toolsMarkdown.cell.noDescription")} |`,
		);
	}

	return [
		`| ${t("tui.toolsMarkdown.column.tool")} | ${t("tui.toolsMarkdown.column.description")} |`,
		"|------|-------------|",
		...rows,
	].join("\n");
}
