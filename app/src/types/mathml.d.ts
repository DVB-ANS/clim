// MathML elements for JSX. @types/react 19 has no MathML intrinsic elements, while React DOM already
// renders them in the MathML namespace. Used by the typeset fee formula on /how.
import type { HTMLAttributes } from "react";

type MathMLProps = HTMLAttributes<MathMLElement> & {
  display?: "block" | "inline";
  displaystyle?: "true" | "false";
  mathvariant?: "normal";
  separator?: "true" | "false";
  stretchy?: "true" | "false";
  lspace?: string;
  rspace?: string;
  width?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps;
      mrow: MathMLProps;
      mi: MathMLProps;
      mn: MathMLProps;
      mo: MathMLProps;
      mtext: MathMLProps;
      mspace: MathMLProps;
      mfrac: MathMLProps;
      msqrt: MathMLProps;
      msup: MathMLProps;
      msub: MathMLProps;
    }
  }
}
