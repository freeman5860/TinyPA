import Anthropic from "@anthropic-ai/sdk";
import {
  LLMProvider,
  ExtractedItem,
  DigestInput,
  DigestResult,
} from "./provider";
import {
  EXTRACT_SYSTEM,
  extractUserPrompt,
  DIGEST_SYSTEM,
  digestUserPrompt,
} from "./prompts";
import { NdjsonExtractParser, parseDigestOutput } from "./ndjson";

// Anthropic provider — speaks Claude natively (not OpenAI-compatible).
// Prompt caching is enabled on the stable system prompts so repeat calls
// within 5 minutes reuse cached input tokens (~10x cheaper on the cache-hit path).

const EXTRACT_MODEL = process.env.LLM_EXTRACT_MODEL ?? "claude-haiku-4-5";
const DIGEST_MODEL = process.env.LLM_DIGEST_MODEL ?? "claude-haiku-4-5";
const EXTRACT_STREAM = (process.env.LLM_EXTRACT_STREAM ?? "true").toLowerCase() !== "false";
const EXTRACT_MAX_TOKENS = Number(process.env.LLM_EXTRACT_MAX_TOKENS ?? 1024);
const DIGEST_MAX_TOKENS = Number(process.env.LLM_DIGEST_MAX_TOKENS ?? 2048);

function makeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey, timeout: 45_000, maxRetries: 0 });
}

export class AnthropicProvider implements LLMProvider {
  async extract(
    input: { text: string; now: string; timezone: string },
    onItem: (item: ExtractedItem) => Promise<void>
  ): Promise<void> {
    const client = makeClient();
    const reqStart = Date.now();
    console.log("[anthropic.extract] start", {
      model: EXTRACT_MODEL,
      stream: EXTRACT_STREAM,
      maxTokens: EXTRACT_MAX_TOKENS,
      inputLen: input.text.length,
    });

    const systemBlocks: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: EXTRACT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ];

    const parser = new NdjsonExtractParser(onItem);
    let firstChunkLogged = false;
    const usage = { cache_creation: 0, cache_read: 0 };

    try {
      if (EXTRACT_STREAM) {
        const stream = client.messages.stream({
          model: EXTRACT_MODEL,
          max_tokens: EXTRACT_MAX_TOKENS,
          temperature: 0.4,
          system: systemBlocks,
          messages: [
            { role: "user", content: extractUserPrompt(input.text, input.now, input.timezone) },
          ],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            if (!firstChunkLogged) {
              firstChunkLogged = true;
              console.log("[anthropic.extract] first chunk", {
                model: EXTRACT_MODEL,
                ttfbMs: Date.now() - reqStart,
              });
            }
            await parser.feed(event.delta.text);
          } else if (event.type === "message_start" && event.message?.usage) {
            usage.cache_creation = event.message.usage.cache_creation_input_tokens ?? 0;
            usage.cache_read = event.message.usage.cache_read_input_tokens ?? 0;
          }
        }
        await parser.finish();
      } else {
        const res = await client.messages.create({
          model: EXTRACT_MODEL,
          max_tokens: EXTRACT_MAX_TOKENS,
          temperature: 0.4,
          system: systemBlocks,
          messages: [
            { role: "user", content: extractUserPrompt(input.text, input.now, input.timezone) },
          ],
        });
        usage.cache_creation = res.usage?.cache_creation_input_tokens ?? 0;
        usage.cache_read = res.usage?.cache_read_input_tokens ?? 0;
        const text = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        console.log("[anthropic.extract] first chunk", {
          model: EXTRACT_MODEL,
          ttfbMs: Date.now() - reqStart,
          nonStreaming: true,
        });
        await parser.feedWhole(text);
      }
    } finally {
      console.log("[anthropic.extract] done", {
        emittedCount: parser.emittedCount,
        totalMs: Date.now() - reqStart,
        contentLen: parser.fullContent.length,
        contentPreview: parser.fullContent.slice(0, 300),
        cacheCreation: usage.cache_creation,
        cacheRead: usage.cache_read,
      });
    }
  }

  async digest(input: DigestInput): Promise<DigestResult> {
    const client = makeClient();
    const t0 = Date.now();
    console.log("[anthropic.digest] start", { model: DIGEST_MODEL, maxTokens: DIGEST_MAX_TOKENS });

    const res = await client.messages.create({
      model: DIGEST_MODEL,
      max_tokens: DIGEST_MAX_TOKENS,
      temperature: 0.7,
      system: [
        { type: "text", text: DIGEST_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: digestUserPrompt(input) }],
    });
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    console.log("[anthropic.digest] done", {
      ms: Date.now() - t0,
      rawLen: raw.length,
      cacheCreation: res.usage?.cache_creation_input_tokens ?? 0,
      cacheRead: res.usage?.cache_read_input_tokens ?? 0,
    });
    const { summaryMd, topTodoIds } = parseDigestOutput(raw, input.openTodos.map((t) => t.id));
    return { summaryMd, topTodoIds };
  }
}
