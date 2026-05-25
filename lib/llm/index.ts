import type { LLMProvider } from "./provider";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";

type ProviderKind = "openai-compat" | "anthropic";

function resolveProvider(): ProviderKind {
  const raw = (process.env.LLM_PROVIDER ?? "").toLowerCase().trim();
  if (raw === "anthropic" || raw === "claude") return "anthropic";
  if (raw === "" || raw === "openai" || raw === "openai-compat") return "openai-compat";
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
