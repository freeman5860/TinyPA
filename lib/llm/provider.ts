import { z } from "zod";

export const extractedItemSchema = z.object({
  type: z.enum(["todo", "note", "mood", "followup"]),
  content: z.string().min(1).max(500),
  due_at: z.string().datetime().nullable().optional(),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(20)).max(5).optional(),
});

export const extractResultSchema = z.object({
  items: z.array(extractedItemSchema).max(10),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractResult = z.infer<typeof extractResultSchema>;

export interface DigestInput {
  date: string;
  timezone: string;
  messages: { createdAt: string; rawText: string }[];
  items: {
    type: string;
    content: string;
    status: string;
    dueAt: string | null;
    completedAt: string | null;
  }[];
  openTodos: { id: string; content: string; dueAt: string | null; priority: number }[];
}

export interface DigestResult {
  summaryMd: string;
  topTodoIds: string[];
}

export interface LLMProvider {
  extract(
    input: { text: string; now: string; timezone: string },
    onItem: (item: ExtractedItem) => Promise<void>
  ): Promise<void>;
  digest(input: DigestInput): Promise<DigestResult>;
}
