import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NotesSearchClient } from "@/components/NotesSearchClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <NotesSearchClient />;
}
