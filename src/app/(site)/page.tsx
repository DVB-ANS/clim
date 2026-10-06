import { ViewTransition } from "react";
import { Landing } from "@/components/site/Landing";

export default function HomePage() {
  return (
    // holds the landing still while "Launch app" blooms over it (globals.css, "Launch transition")
    <ViewTransition exit={{ launch: "launch-out", default: "none" }} default="none">
      <Landing />
    </ViewTransition>
  );
}
