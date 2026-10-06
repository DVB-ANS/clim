import { type ReactNode, ViewTransition } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // this layout mounts when the visitor crosses from the landing into the app, which is exactly
    // the launch: the app rises behind the button's blue and pink (globals.css, "Launch transition")
    <ViewTransition enter={{ launch: "launch-in", default: "none" }} default="none">
      <div className="min-h-screen bg-bg text-fg">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </ViewTransition>
  );
}
