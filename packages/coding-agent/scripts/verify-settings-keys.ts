#!/usr/bin/env bun
/**
 * Verifies that every derived `settings.item.<id>.<field>` key exists in both
 * catalogs, with `en` equal to the literal the domain file declares.
 *
 * The keys are computed from the setting id at runtime, so
 * `packages/i18n/scripts/verify-keys.ts` cannot see them — a missing one would
 * leak the raw key string into the settings panel.
 *
 * Usage: bun packages/coding-agent/scripts/verify-settings-keys.ts
 */
import { en } from "@oh-my-pi/pi-i18n/locales/en";
import { zhCN } from "@oh-my-pi/pi-i18n/locales/zh-CN";
import { orderedSettings } from "../src/config/all-settings";

const missingEn: string[] = [];
const missingZh: string[] = [];
const mismatched: string[] = [];

function check(key: string, englishText: string): void {
	if (!(key in en)) missingEn.push(`${key} = ${JSON.stringify(englishText)}`);
	else if (en[key as keyof typeof en] !== englishText)
		mismatched.push(
			`${key}: en=${JSON.stringify(en[key as keyof typeof en])} expected=${JSON.stringify(englishText)}`,
		);
	if (!(key in zhCN)) missingZh.push(`${key} = ${JSON.stringify(englishText)}`);
}

for (const setting of orderedSettings()) {
	const ui = setting.ui;
	if (!ui) continue;
	const id = setting.id;
	check(`settings.item.${id}.label`, ui.label);
	check(`settings.item.${id}.description`, ui.description);
	if (ui.warning) check(`settings.item.${id}.warning`, ui.warning);
	if (Array.isArray(ui.options)) {
		for (const option of ui.options) {
			check(`settings.item.${id}.option.${option.value}.label`, option.label);
			if (option.description) check(`settings.item.${id}.option.${option.value}.description`, option.description);
		}
	}
}

const report = (label: string, lines: string[]): void => {
	console.log(`${label}: ${lines.length}`);
	for (const line of lines) console.log(`  ${line}`);
};
report("missing in en", missingEn);
report("missing in zh", missingZh);
report("en value mismatched", mismatched);
if (missingEn.length || missingZh.length || mismatched.length) process.exit(1);
