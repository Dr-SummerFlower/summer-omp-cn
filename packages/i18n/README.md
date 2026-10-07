# @oh-my-pi/pi-i18n

Localization runtime and `zh-CN` message catalog shared by the omp packages.

Every package that renders user-facing text (`@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`, …) depends on this package instead of owning its own translation layer, so the catalog and the `t()` lookup live in one place.

## Usage

```ts
import { t, setLanguage } from "@oh-my-pi/pi-i18n";

setLanguage("zh-CN");
t("common.status.ready"); // → "就绪"
t("tui.status.updateAvailable", { version: "18.4.4" });
```

- `Language` is `"en" | "zh-CN"`; `normalizeLanguage` accepts aliases (`zh`, `zh-hans`, `中文`, …).
- The active language is process-global state, driven by the `language` setting at startup and on change.
- Keys are semantic (`<domain>.<module>.<scene>.<field>`), so an upstream English wording change touches only the catalog value, never a call site.
- `locales/en.ts` and `locales/zh-CN.ts` are the catalogs; both key sets must stay in sync.

## Tooling

Catalog edits go through `scripts/`, never by hand-appending to the locale files.

| Script                                        | Purpose                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/add-keys.ts <keys.json>`             | Appends `{ key, en, zh }[]` to both catalogs, just before their closing brace. Every entry needs an explicit `zh`; duplicates and missing translations abort the run.                                                                          |
| `scripts/verify-keys.ts <source.ts> <prefix>` | Diffs the `t("prefix.…")` literals a source file uses against both catalogs — missing and unused keys, both directions. Only inline string literals are visible; use `coding-agent/scripts/verify-settings-keys.ts` for keys built at runtime. |

Regeneration pipelines that produce a `keys.json` live in the package that owns the input; today that is `packages/coding-agent/scripts/gen-settings-keys.ts` (settings-panel metadata).

## Status

All call sites use semantic `t("…")` keys. The original `localizeUiText` (English-text-as-key) mechanism and its `zh-CN-settings` / `zh-CN-ui` maps have been removed; `locales/en.ts` and `locales/zh-CN.ts` are the only catalogs.
