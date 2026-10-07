import { ViewTransition } from "react";
import { Landing } from "@/components/site/Landing";

export default function HomePage() {
  return (
    // holds the landing still while the app opens over it from "Launch app"'s disc, and lets it rise
    // back in when the app's wordmark brings the visitor home (globals.css, "Launch transition")
    <ViewTransition exit={{ launch: "launch-out", default: "none" }} enter={{ home: "home-in", default: "none" }} default="none">
      <Landing />
    </ViewTransition>
  );
}
