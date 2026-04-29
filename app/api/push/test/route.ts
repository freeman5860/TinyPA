import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendWebPushToUser } from "@/lib/push/webpush";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await sendWebPushToUser(session.user.id, {
    title: "TinyPA 测试推送",
    body: "如果你看到这条通知，说明浏览器订阅成功了 ✅",
    url: "/today",
    tag: "test",
  });

  return NextResponse.json(result);
}
