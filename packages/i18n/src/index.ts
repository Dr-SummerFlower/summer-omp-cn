import { type EnglishTranslationKey, en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";

export type Language = "en" | "zh-CN";
export type TranslationKey = EnglishTranslationKey;
export type TranslationVariables = Readonly<Record<string, string | number | boolean | null | undefined>>;

const languageAliases: Readonly<Record<string, Language>> = {
	en: "en",
	english: "en",
	英文: "en",
	zh: "zh-CN",
	"zh-cn": "zh-CN",
	"zh-hans": "zh-CN",
	chinese: "zh-CN",
	中文: "zh-CN",
};

let currentLanguage: Language = "en";

export function normalizeLanguage(value: unknown): Language | undefined {
	if (typeof value !== "string") return undefined;
	return languageAliases[value.trim().toLowerCase()];
}

export function getLanguage(): Language {
	return currentLanguage;
}

export function setLanguage(value: unknown): Language {
	const language = normalizeLanguage(value);
	if (!language || language === currentLanguage) return currentLanguage;

	currentLanguage = language;
	return currentLanguage;
}

function resolveTranslation(key: string): string {
	const englishText = Object.hasOwn(en, key) ? en[key as TranslationKey] : undefined;
	if (currentLanguage === "en") return englishText ?? key;
	return zhCN[key as TranslationKey] ?? englishText ?? key;
}

function interpolate(text: string, variables: TranslationVariables | undefined): string {
	if (!variables) return text;
	return text.replace(
		/\{\{\s*([\w.-]+)\s*\}\}|\{([\w.-]+)\}|%\{([\w.-]+)\}/g,
		(match, doubleName: string | undefined, singleName: string | undefined, percentName: string | undefined) => {
			const name = doubleName ?? singleName ?? percentName;
			if (!name || !Object.hasOwn(variables, name)) return match;
			const value = variables[name];
			return value === null || value === undefined ? "" : String(value);
		},
	);
}

export function t(key: string, variables?: TranslationVariables): string {
	return interpolate(resolveTranslation(key), variables);
}

export { en } from "./locales/en";
export { zhCN } from "./locales/zh-CN";
