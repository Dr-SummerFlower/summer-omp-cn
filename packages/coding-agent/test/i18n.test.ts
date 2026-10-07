import { afterEach, describe, expect, it } from "bun:test";
import { createSettingsHost } from "@oh-my-pi/pi-coding-agent/config/settings-ui";
import { getLanguage, normalizeLanguage, setLanguage, t } from "@oh-my-pi/pi-i18n";
import { getSettingsForTab } from "@oh-my-pi/pi-tui/overlays/settings-defs";

describe("i18n", () => {
	afterEach(() => {
		setLanguage("en");
	});

	it("normalizes supported language names and rejects unknown values", () => {
		expect(normalizeLanguage("en")).toBe("en");
		expect(normalizeLanguage("English")).toBe("en");
		expect(normalizeLanguage("英文")).toBe("en");
		expect(normalizeLanguage("zh")).toBe("zh-CN");
		expect(normalizeLanguage("ZH-HANS")).toBe("zh-CN");
		expect(normalizeLanguage("中文")).toBe("zh-CN");
		expect(normalizeLanguage("fr")).toBeUndefined();
		expect(normalizeLanguage(undefined)).toBeUndefined();
	});

	it("changes and reports the active language", () => {
		expect(setLanguage("chinese")).toBe("zh-CN");
		expect(getLanguage()).toBe("zh-CN");
		expect(setLanguage("english")).toBe("en");
		expect(getLanguage()).toBe("en");
	});

	it("falls back to English and preserves unknown keys", () => {
		setLanguage("zh-CN");
		expect(t("common.feedback.error")).toBe("错误");
		expect(t("i18n.unknown.key")).toBe("i18n.unknown.key");
	});

	it("interpolates values without changing missing placeholders", () => {
		setLanguage("zh-CN");
		expect(t("tui.status.running", { count: 3 })).toBe("运行中：3");
		expect(t("common.feedback.failedWithReason", { reason: "timeout" })).toBe("失败：timeout");
		expect(t("common.format.usageLine", { other: "value" })).toBe("用法：{{usage}}");
	});

	it("localizes process monitoring, maintenance, selectors, and launch completion for Chinese users", () => {
		setLanguage("zh-CN");
		expect(t("cli.ps.noScopes")).toBe("未找到守护进程代理作用域。");
		expect(t("tui.ps.summary", { processes: "2 个进程", scopes: "1 个作用域", scopeMode: "（当前）" })).toBe(
			"2 个进程，分布于1 个作用域 （当前）",
		);
		expect(t("tui.compaction.remoteFailed")).toBe("服务器自动压缩失败；将跳过维护并继续");
		expect(t("tui.selector.messagePosition", { position: 2, total: 5 })).toBe("第 2 条，共 5 条");
		expect(t("tui.transcript.supervisedCompleted")).toBe("受监管进程已完成");
	});

	it("localizes settings metadata for the model tab", () => {
		setLanguage("zh-CN");
		const entries = createSettingsHost().entries;
		const modelSettings = getSettingsForTab(entries, "model");
		const thinking = modelSettings.find(setting => setting.path === "defaultThinkingLevel");
		const sampling = modelSettings.find(setting => setting.path === "temperature");

		expect(thinking?.group).toBe("Thinking");
		expect(thinking?.label).toBe("思考级别");
		expect(thinking?.description).toBe("支持思考的模型的推理深度");
		const thinkingOptions = thinking?.type === "submenu" ? thinking.options : undefined;
		expect(thinkingOptions?.[0]?.label).toBe("自动");
		expect(sampling?.label).toBe("温度");
		expect(sampling?.description).toBe("采样温度（0 = 确定性，1 = 创造性，-1 = 提供商默认）");
	});

	it("localizes representative metadata across every settings tab", () => {
		setLanguage("zh-CN");
		const entries = createSettingsHost().entries;
		const expected = [
			["appearance", "language", "语言"],
			["model", "model.toolCallLoopGuard.enabled", "工具调用循环保护"],
			["interaction", "ask.timeout", "提问超时"],
			["context", "compaction.methodOrder", "压缩方法顺序"],
			["memory", "memory.backend", "记忆后端"],
			["files", "read.summarize.enabled", "读取摘要"],
			["shell", "shellMinimizer.enabled", "Shell 输出精简"],
			["tools", "todo.enabled", "待办事项"],
			["tasks", "goal.enabled", "目标模式"],
			["providers", "providers.webSearchTimeoutSeconds", "网页搜索超时"],
		] as const;

		for (const [tab, path, label] of expected) {
			const setting = getSettingsForTab(entries, tab).find(candidate => candidate.path === path);
			expect(setting?.label, `${tab}:${path}`).toBe(label);
			expect(setting?.description, `${tab}:${path}`).not.toMatch(/^[A-Za-z][A-Za-z\s-]*$/);
		}
	});

	it("localizes the 17.4 settings metadata and ordered compaction choices", () => {
		setLanguage("zh-CN");
		const entries = createSettingsHost().entries;
		const expected = [
			["providers", "providers.openai-codex.codeMode", "Codex 代码模式"],
			["appearance", "composer.shape", "输入框样式"],
			["appearance", "statusLine.contextLine", "上下文响应线"],
			["model", "externalThinking", "外部思考"],
			["context", "extendedContext", "扩展上下文"],
			["context", "compaction.methodOrder", "压缩方法顺序"],
			["context", "compaction.asyncEnabled", "异步压缩"],
			["shell", "eval.autoBackground.enabled", "Eval 自动后台运行"],
			["providers", "providers.cacheRetention", "提示词缓存保留策略"],
		] as const;

		for (const [tab, path, label] of expected) {
			const setting = getSettingsForTab(entries, tab).find(candidate => candidate.path === path);
			expect(setting?.label, `${tab}:${path}`).toBe(label);
			expect(setting?.description, `${tab}:${path}`).not.toMatch(/^[A-Za-z]/);
		}

		const modelSettings = getSettingsForTab(entries, "model");
		const externalThinking = modelSettings.find(setting => setting.path === "externalThinking");
		expect(externalThinking?.warning).toBe("风险自负：提供商已将此类请求判定为滥用，最严重可能触发账号级处置");

		const contextSettings = getSettingsForTab(entries, "context");
		const methodOrder = contextSettings.find(setting => setting.path === "compaction.methodOrder");
		const methodOptions = methodOrder?.type === "multiselect" ? methodOrder.options : undefined;
		expect(methodOptions?.map(option => option.label)).toEqual([
			"服务端压缩",
			"Snapcompact",
			"交接",
			"软压缩",
			"抖动压缩",
		]);

		const appearanceSettings = getSettingsForTab(entries, "appearance");
		const contextLine = appearanceSettings.find(setting => setting.path === "statusLine.contextLine");
		const contextLineOptions = contextLine?.type === "submenu" ? contextLine.options : undefined;
		expect(contextLineOptions?.map(option => option.label)).toEqual(["关", "百分比", "带标记", "嵌入式"]);
	});
});
