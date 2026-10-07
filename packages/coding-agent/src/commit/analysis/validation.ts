import type { ConventionalAnalysis } from "../../commit/types";
import { t } from "@oh-my-pi/pi-i18n";

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

export function validateSummary(summary: string, maxChars: number): ValidationResult {
	const errors: string[] = [];
	if (!summary.trim()) {
		errors.push(t("tui.ca.commit.analysis.validation.summaryIsEmpty"));
	}
	if (summary.length > maxChars) {
		errors.push(`Summary exceeds ${maxChars} characters`);
	}
	if (summary.trimEnd().endsWith(".")) {
		errors.push(t("tui.ca.commit.analysis.validation.summaryMustNotEndWithA"));
	}
	if (summary.includes("\n")) {
		errors.push(t("tui.ca.commit.analysis.validation.summaryMustBeASingleLine"));
	}
	return { valid: errors.length === 0, errors };
}

export function validateScope(scope: string | null): ValidationResult {
	if (!scope) return { valid: true, errors: [] };
	const errors: string[] = [];
	const segments = scope.split("/");
	if (segments.length > 2) {
		errors.push(t("tui.ca.commit.analysis.validation.scopeMayContainAtMostTwo"));
	}
	for (const segment of segments) {
		if (!segment) {
			errors.push(t("tui.ca.commit.analysis.validation.scopeSegmentsCannotBeEmpty"));
			continue;
		}
		if (segment !== segment.toLowerCase()) {
			errors.push(t("tui.ca.commit.analysis.validation.scopeMustBeLowercase"));
		}
		if (!/^[a-z0-9][a-z0-9-_]*$/.test(segment)) {
			errors.push(`Scope segment has invalid characters: ${segment}`);
		}
	}
	return { valid: errors.length === 0, errors };
}

export function validateAnalysis(analysis: ConventionalAnalysis): ValidationResult {
	const errors: string[] = [];
	const scopeResult = validateScope(analysis.scope);
	if (!scopeResult.valid) {
		errors.push(...scopeResult.errors);
	}
	for (const detail of analysis.details) {
		if (!detail.text.trim()) {
			errors.push(t("tui.ca.commit.analysis.validation.detailTextIsEmpty"));
			continue;
		}
		if (!detail.text.trim().endsWith(".")) {
			errors.push(`Detail must end with a period: ${detail.text}`);
		}
		if (detail.text.length > 120) {
			errors.push(`Detail exceeds 120 characters: ${detail.text}`);
		}
	}
	return { valid: errors.length === 0, errors };
}
