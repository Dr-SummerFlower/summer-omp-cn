#!/usr/bin/env bun
/**
 * Appends i18n entries to the `en` and `zh-CN` catalogs.
 *
 * The input is a JSON array of `{ key, en, zh }`. Every entry MUST carry an
 * explicit `zh`: the writer never guesses a translation, so a missing one is a
 * hard error listing exactly what to translate.
 *
 * Entries are inserted just before the closing brace of each catalog, keeping
 * the files' hand-written ordering intact.
 *
 * Usage: bun packages/i18n/scripts/add-keys.ts <keys.json>
 */
import * as path from "node:path";

type Entry = { key: string; en: string; zh?: string };

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
const enPath = path.join(repoRoot, "packages", "i18n", "src", "locales", "en.ts");
const zhPath = path.join(repoRoot, "packages", "i18n", "src", "locales", "zh-CN.ts");

const jsonPath = process.argv[2];
if (!jsonPath) throw new Error("usage: bun packages/i18n/scripts/add-keys.ts <keys.json>");
const entries = JSON.parse(await Bun.file(jsonPath).text()) as Entry[];

const enSrc = await Bun.file(enPath).text();
const zhSrc = await Bun.file(zhPath).text();

const missingZh: string[] = [];
const dupes: string[] = [];
const enLines: string[] = [];
const zhLines: string[] = [];

const escape = (value: string) =>
	value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");

for (const entry of entries) {
	if (enSrc.includes(`"${entry.key}":`) || enLines.some(line => line.includes(`"${entry.key}":`))) {
		dupes.push(entry.key);
		continue;
	}
	if (entry.zh === undefined) {
		missingZh.push(`${entry.key} <- ${JSON.stringify(entry.en)}`);
		continue;
	}
	enLines.push(`\t"${entry.key}": "${escape(entry.en)}",`);
	zhLines.push(`\t"${entry.key}": "${escape(entry.zh)}",`);
}

if (dupes.length > 0) {
	console.error("duplicate keys:\n" + dupes.join("\n"));
	process.exit(1);
}
if (missingZh.length > 0) {
	console.error("no zh translation supplied for:\n" + missingZh.join("\n"));
	process.exit(1);
}

const enMarker = "} as const;";
const zhMarker = "};";
const enIndex = enSrc.lastIndexOf(enMarker);
const zhIndex = zhSrc.lastIndexOf(zhMarker);
if (enIndex < 0 || zhIndex < 0) throw new Error("insertion marker not found");

await Bun.write(enPath, enSrc.slice(0, enIndex) + enLines.join("\n") + "\n" + enSrc.slice(enIndex));
await Bun.write(zhPath, zhSrc.slice(0, zhIndex) + zhLines.join("\n") + "\n" + zhSrc.slice(zhIndex));
console.log(`added ${enLines.length} keys`);
