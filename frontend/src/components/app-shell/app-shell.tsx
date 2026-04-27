import { AppRail } from "@/components/app-shell/app-rail";
import { AppMobileHeader } from "@/components/app-shell/mobile-header";
import { Separator } from "@/components/ui/separator";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <AppRail />
      <div className="flex min-h-dvh flex-col">
        <AppMobileHeader />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <Separator />
        <footer>
          <div className="px-6 py-8 lg:px-10">
            <p className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              The Lens DB · a community reference — originally inspired by lens-db.com (2012–2025).
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
