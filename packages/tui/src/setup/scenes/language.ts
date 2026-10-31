import { t } from "@oh-my-pi/pi-i18n";
import { type SgrMouseEvent } from "../../mouse";
import { type SelectItem, SelectList } from "../../components/select-list";
import { Text } from "../../components/text";
import { WizardStep } from "../../components/wizard-step";
import { editorKey } from "../../chrome/keybinding-hints";
import { getSelectListTheme, theme } from "../../theme/theme";
import { col, span, text } from "../../native/describe";
import type { NativeNode } from "../../native/node";
import { Memo } from "../../native/memo";
import type { SetupScene, SetupSceneController, SetupSceneHost } from "./types";

/** Selectable interface languages, in picker order. */
const LANGUAGE_VALUES = ["en", "zh-CN"] as const;
type SetupLanguage = (typeof LANGUAGE_VALUES)[number];

/** Endonyms (each language names itself) with the localized effect as the detail column. */
function languageItems(): readonly SelectItem[] {
	return [
		{
			value: "en",
			label: `1  ${t("tui.setup.language.optionEnglish")}`,
			description: t("tui.setup.language.optionEnglishDesc"),
		},
		{
			value: "zh-CN",
			label: `2  ${t("tui.setup.language.optionChinese")}`,
			description: t("tui.setup.language.optionChineseDesc"),
		},
	];
}

class LanguageSceneController implements SetupSceneController {
	title = t("tui.setup.language.title");
	subtitle = t("tui.setup.language.subtitle");
	#selectList: SelectList;
	#items: readonly SelectItem[];
	#committing = false;
	#step: WizardStep | undefined;
	#native = new Memo();

	readonly #host: SetupSceneHost;

	constructor(host: SetupSceneHost) {
		this.#host = host;
		this.#items = languageItems();
		this.#selectList = new SelectList(this.#items, this.#items.length, getSelectListTheme());
		const currentIndex = LANGUAGE_VALUES.indexOf(host.ctx.language as SetupLanguage);
		this.#selectList.setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
		this.#selectList.onSelect = item => {
			void this.#commit(item.value as SetupLanguage);
		};
		this.#selectList.onCancel = () => host.finish("skipped");
	}

	invalidate(): void {
		this.#native.clear();
		if (this.#step) this.#step.invalidate();
		else this.#selectList.invalidate();
	}

	handleInput(data: string): void {
		if (this.#committing) return;
		const quickIndex = data >= "1" && data <= "2" ? Number(data) - 1 : -1;
		if (quickIndex >= 0) {
			this.#selectList.setSelectedIndex(quickIndex);
			void this.#commit(LANGUAGE_VALUES[quickIndex]);
			return;
		}
		if (this.#step) this.#step.handleInput(data);
		else this.#selectList.handleInput(data);
	}

	routeMouse(event: SgrMouseEvent, line: number, col: number): void {
		if (this.#committing) return;
		this.#step?.routeMouse(event, line, col);
	}

	render(width: number, maxLines?: number): readonly string[] {
		const confirm = editorKey("tui.select.confirm");
		const intro = new Text(theme.fg("muted", t("tui.setup.language.intro", { confirm })), 0, 0);
		if (!this.#step) {
			this.#step = new WizardStep({
				kind: "choice",
				intro,
				content: this.#selectList,
				minContentLines: this.#items.length,
				fitContent: () => {
					this.#selectList.setMaxVisible(this.#items.length);
				},
			});
		} else {
			this.#step.setIntro(intro);
		}
		this.#step.setMaxHeight(maxLines);
		return this.#step.render(width);
	}

	describe(): NativeNode {
		const confirm = editorKey("tui.select.confirm");
		return this.#native.get([confirm], () =>
			col([text([span(t("tui.setup.language.intro", { confirm }), "muted")]), this.#selectList], {
				gap: "sm",
				role: "omp.setup.language",
			}),
		);
	}

	async #commit(language: SetupLanguage): Promise<void> {
		if (this.#committing) return;
		this.#committing = true;
		// Apply before advancing: every later scene and the transcript re-render
		// through `t()` and must read the chosen language already.
		await this.#host.ctx.saveLanguage(language);
		this.#host.finish("done");
	}
}

/** Ask for the interface language first so every later scene renders in it. */
export const languageSetupScene: SetupScene = {
	id: "language",
	// Lazy so the wizard renders the title in the language active at mount time.
	get title(): string {
		return t("tui.setup.language.title");
	},
	minVersion: 3,
	shouldRun: ctx => !ctx.languageConfigured,
	mount: host => new LanguageSceneController(host),
};
