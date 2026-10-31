/**
 * Classify an install spec as a local path or a plain npm package.
 *
 * Rules (applied in order):
 *  0. Looks like a filesystem path (`.`, `..`, `./…`, `..\…`, `/…`, `~/…`,
 *     `C:\…`, `\\unc`) -> local. Routed through `PluginManager.link()` so the
 *     `omp plugin install <path>` and `omp plugin link <path>` flows agree.
 *  1. Anything else -> npm.
 */

/**
 * Detect specs that name a filesystem path rather than a package: bare `.` /
 * `..`, cwd-relative (`./`, `../`, `.\`, `..\`), absolute (`/`, `C:\`, `C:/`,
 * UNC `\\`), and tilde-prefixed (`~`, `~/`, `~\`). Tilde paths still rely on
 * the shell or the caller for expansion — we only classify them so they reach
 * the link path instead of npm-name validation.
 */
function isLocalPathSpec(spec: string): boolean {
	if (spec === "." || spec === ".." || spec === "~") return true;
	if (spec.startsWith("./") || spec.startsWith("../")) return true;
	if (spec.startsWith(".\\") || spec.startsWith("..\\")) return true;
	if (spec.startsWith("~/") || spec.startsWith("~\\")) return true;
	if (spec.startsWith("/")) return true;
	if (spec.startsWith("\\\\")) return true;
	if (/^[A-Za-z]:[\\/]/.test(spec)) return true;
	return false;
}

export type ClassifiedInstallTarget = { type: "local"; path: string } | { type: "npm"; spec: string };

export function classifyInstallTarget(spec: string): ClassifiedInstallTarget {
	if (isLocalPathSpec(spec)) return { type: "local", path: spec };
	return { type: "npm", spec };
}
