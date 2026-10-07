#!/usr/bin/env bun
/**
 * Checks that every key used by a `t("prefix.…")` call site in a source file is
 * defined in both catalogs, and that neither catalog carries keys the file no
 * longer uses.
 *
 * Only inline double-quoted literals are collected: keys built from a variable
 * or template literal are invisible to this scan (use a dedicated checker for
 * those, e.g. `coding-agent/scripts/verify-settings-keys.ts`).
 *
 * Usage: bun packages/i18n/scripts/verify-keys.ts <source.ts> <prefix>
 */
import { en } from "../src/locales/en";
import { zhCN } from "../src/locales/zh-CN";

const [, , srcPath, prefix] = process.argv;
if (!srcPath || !prefix) throw new Error("usage: bun packages/i18n/scripts/verify-keys.ts <source.ts> <prefix>");

const src = await Bun.file(srcPath).text();
const used = new Set<string>();

// Scan each `t(` call, walk to its matching `)`, and collect string literals inside.
const callStart = /\bt\(/g;
let m: RegExpExecArray | null;
while ((m = callStart.exec(src)) !== null) {
	let depth = 0;
	let i = m.index + 1; // index of '('
	for (; i < src.length; i++) {
		const ch = src[i];
		if (ch === "(") depth++;
		else if (ch === ")") {
			depth--;
			if (depth === 0) break;
		} else if (ch === '"') {
			const end = src.indexOf('"', i + 1);
			const literal = src.slice(i + 1, end);
			if (literal.startsWith(prefix)) used.add(literal);
			i = end;
		}
	}
}

const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zhCN));

const inScope = (k: string) => k.startsWith(prefix);
const usedList = [...used].sort();
const enList = [...enKeys].filter(inScope).sort();
const zhList = [...zhKeys].filter(inScope).sort();

const missingEn = usedList.filter(k => !enKeys.has(k));
const missingZh = usedList.filter(k => !zhKeys.has(k));
const unusedEn = enList.filter(k => !used.has(k));
const unusedZh = zhList.filter(k => !used.has(k));

console.log(`used: ${usedList.length} en: ${enList.length} zh: ${zhList.length}`);
console.log("missing in en:", JSON.stringify(missingEn));
console.log("missing in zh:", JSON.stringify(missingZh));
console.log("defined but unused (en):", JSON.stringify(unusedEn));
console.log("defined but unused (zh):", JSON.stringify(unusedZh));
process.exit(missingEn.length + missingZh.length + unusedEn.length + unusedZh.length === 0 ? 0 : 1);
