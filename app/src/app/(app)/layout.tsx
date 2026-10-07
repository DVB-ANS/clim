import { type ReactNode, ViewTransition } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // this layout mounts when the visitor crosses from the landing into the app, which is exactly the
    // launch: the app opens in a circle from the button's pink disc, and leaves with a short fade when
    // the wordmark takes the visitor home (globals.css, "Launch transition"); moves between app pages
    // stay instant
    <ViewTransition enter={{ launch: "launch-in", default: "none" }} exit={{ home: "home-out", default: "none" }} default="none">
      <div className="min-h-screen bg-bg text-fg">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </ViewTransition>
  );
}
