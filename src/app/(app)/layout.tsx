import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // the app is the desk: the CL-1's dark screen, entered by zooming into the instrument
    <div className="min-h-screen bg-bg text-fg">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
