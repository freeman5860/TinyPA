import { BottomNav } from "@/components/BottomNav";
import { TimezoneSync } from "@/components/TimezoneSync";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let tz = "Asia/Shanghai";
  if (session?.user?.id) {
    const [u] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, session.user.id));
    if (u?.timezone) tz = u.timezone;
  }

  return (
    <div className="min-h-dvh">
      <div className="pb-[calc(56px+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
      <TimezoneSync serverTz={tz} />
    </div>
  );
}
