import type { LLMProvider } from "./provider";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";

// Backwards-compat re-export: the class used to live here. Anything that
// was importing `GemmaProvider` still works; it's now an alias.
export { OpenAICompatProvider as GemmaProvider } from "./openai-compat";

type ProviderKind = "openai-compat" | "anthropic";

function resolveProvider(): ProviderKind {
  const raw = (process.env.LLM_PROVIDER ?? "").toLowerCase().trim();
  if (raw === "anthropic" || raw === "claude") return "anthropic";
  // Aliases that all mean "OpenAI-compatible HTTP":
  if (raw === "" || raw === "openai" || raw === "openai-compat" || raw === "nvidia" || raw === "nim")
    return "openai-compat";
  console.warn(`[llm] unknown LLM_PROVIDER="${raw}", falling back to openai-compat`);
  return "openai-compat";
}

let singleton: LLMProvider | null = null;
let singletonKind: ProviderKind | null = null;

export function getLLM(): LLMProvider {
  const kind = resolveProvider();
  if (singleton && singletonKind === kind) return singleton;
  singleton = kind === "anthropic" ? new AnthropicProvider() : new OpenAICompatProvider();
  singletonKind = kind;
  console.log("[llm] provider selected", { kind });
  return singleton;
}
