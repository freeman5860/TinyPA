import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="pb-[calc(56px+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </div>
  );
}
