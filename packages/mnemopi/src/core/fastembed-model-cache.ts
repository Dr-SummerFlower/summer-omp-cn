import * as path from "node:path";
import { $env } from "@oh-my-pi/pi-utils";

const FASTEMBED_MODEL_SIDECARS = [
	"config.json",
	"tokenizer.json",
	"tokenizer_config.json",
	"special_tokens_map.json",
] as const;

/**
 * Hugging Face repo fastembed downloads each `fast-*` model from. Mirrors
 * fastembed's `MODEL_SOURCES` (v2.1.1+): archives are no longer fetched from the
 * retired `qdrant-fastembed` GCS bucket, so every file comes from these repos.
 */
const FASTEMBED_HF_REPOS: Record<string, string> = {
	"fast-all-MiniLM-L6-v2": "Qdrant/all-MiniLM-L6-v2-onnx",
	"fast-bge-base-en": "Qdrant/fast-bge-base-en",
	"fast-bge-base-en-v1.5": "Qdrant/bge-base-en-v1.5-onnx-Q",
	"fast-bge-small-en": "Qdrant/bge-small-en",
	"fast-bge-small-en-v1.5": "Qdrant/bge-small-en-v1.5-onnx-Q",
	"fast-bge-small-zh-v1.5": "Qdrant/bge-small-zh-v1.5",
	"fast-multilingual-e5-large": "Qdrant/multilingual-e5-large-onnx",
};

/**
 * Directory fastembed unpacks a model into: `<cacheDir>/<hfRepo with "/" → "_">`
 * (fastembed `retrieveModel`). Returns `null` for a model id fastembed does not
 * recognize.
 */
export function fastembedModelCacheDir(model: string, cacheDir: string): string | null {
	const repo = FASTEMBED_HF_REPOS[model];
	return repo === undefined ? null : path.join(cacheDir, repo.replace("/", "_"));
}

/** Download missing config/tokenizer sidecars into a fastembed model cache directory. */
export async function ensureFastembedModelSidecars(model: string, cacheDir = "local_cache"): Promise<boolean> {
	const repo = FASTEMBED_HF_REPOS[model];
	if (repo === undefined) return false;

	const modelDir = path.join(cacheDir, repo.replace("/", "_"));
	const endpoint = $env.HF_ENDPOINT || "https://huggingface.co";
	for (const fileName of FASTEMBED_MODEL_SIDECARS) {
		const target = path.join(modelDir, fileName);
		if (await Bun.file(target).exists()) continue;

		const response = await fetch(`${endpoint}/${repo}/resolve/main/${fileName}`);
		if (!response.ok) {
			throw new Error(
				`Failed to download ${model} ${fileName} from ${repo}: ${response.status} ${response.statusText}`,
			);
		}
		await Bun.write(target, await response.arrayBuffer());
	}
	return true;
}
