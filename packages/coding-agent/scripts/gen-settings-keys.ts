#!/usr/bin/env bun
/**
 * Emits the `settings.item.<id>.<field>` translation keys for the settings panel.
 *
 * Walks the live settings registry (every domain registered by
 * `src/config/all-settings.ts`) and produces one entry per `ui.label`,
 * `ui.description`, `ui.warning`, and enum `options[].label` / `.description`.
 * `settings-ui.ts` resolves these keys from the setting id at panel-open time,
 * so adding an upstream setting needs no call-site edit — only a regeneration.
 *
 * `en` is the literal declared in the domain file, captured at runtime.
 * `zh` is taken from the semantic catalog (`en` ↔ `zh-CN` pairs), with
 * `scripts/settings-zh-extra.json` overriding it as the reviewed supplement.
 * The run reports any string it could not translate and writes them to
 * `.bun-tmp/settings-zh-missing.json`.
 *
 * Usage: bun packages/coding-agent/scripts/gen-settings-keys.ts [out.json]
 */
import * as path from "node:path";
import { en } from "@oh-my-pi/pi-i18n/locales/en";
import { zhCN } from "@oh-my-pi/pi-i18n/locales/zh-CN";
import { orderedSettings } from "../src/config/all-settings";

type Entry = { key: string; en: string; zh?: string };

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
const tmpDir = path.join(repoRoot, ".bun-tmp");
const extraPath = path.join(import.meta.dir, "settings-zh-extra.json");

/** English display text -> Chinese, from the semantic catalog. */
const englishToZh = new Map<string, string>();
for (const [key, englishText] of Object.entries(en)) {
	const chineseText = zhCN[key as keyof typeof zhCN] as string | undefined;
	if (englishText && chineseText && chineseText !== englishText) englishToZh.set(englishText, chineseText);
}
// The reviewed supplement wins over the harvested catalog.
const extra = (await Bun.file(extraPath).json()) as Record<string, string>;
for (const [englishText, chineseText] of Object.entries(extra)) englishToZh.set(englishText, chineseText);

const entries: Entry[] = [];
const missingZh: string[] = [];
const seenKeys = new Set<string>();

function push(key: string, englishText: string | undefined): void {
	if (englishText === undefined) return;
	if (seenKeys.has(key)) throw new Error(`duplicate key: ${key}`);
	seenKeys.add(key);
	const zh = englishToZh.get(englishText);
	if (zh === undefined) missingZh.push(`${key} <- ${JSON.stringify(englishText)}`);
	entries.push({ key, en: englishText, ...(zh !== undefined ? { zh } : {}) });
}

for (const setting of orderedSettings()) {
	const ui = setting.ui;
	if (!ui) continue;
	const id = setting.id;
	push(`settings.item.${id}.label`, ui.label);
	push(`settings.item.${id}.description`, ui.description);
	push(`settings.item.${id}.warning`, ui.warning);
	const options = ui.options;
	if (Array.isArray(options)) {
		for (const option of options) {
			push(`settings.item.${id}.option.${option.value}.label`, option.label);
			push(`settings.item.${id}.option.${option.value}.description`, option.description);
		}
	}
}

const outPath = process.argv[2] ?? path.join(tmpDir, "keys-settings.json");
await Bun.write(outPath, `${JSON.stringify(entries, null, "\t")}\n`);
const uniqueMissing = [...new Set(missingZh.map(line => JSON.parse(line.slice(line.indexOf("<- ") + 3)) as string))];
if (uniqueMissing.length > 0) {
	await Bun.write(path.join(tmpDir, "settings-zh-missing.json"), `${JSON.stringify(uniqueMissing, null, "\t")}\n`);
}
console.log(`wrote ${entries.length} keys to ${outPath}`);
console.log(`missing zh entries: ${missingZh.length} (${uniqueMissing.length} unique texts)`);
for (const line of uniqueMissing) console.log(`  ${line}`);
