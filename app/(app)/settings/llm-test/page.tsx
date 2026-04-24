import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LlmTestClient } from "./LlmTestClient";
import { EXTRACT_SYSTEM, DIGEST_SYSTEM } from "@/lib/llm/prompts";

export const dynamic = "force-dynamic";

export default async function LlmTestPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <LlmTestClient
      presets={{
        extract: EXTRACT_SYSTEM,
        digest: DIGEST_SYSTEM,
      }}
    />
  );
}
