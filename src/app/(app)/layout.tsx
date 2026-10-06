import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
