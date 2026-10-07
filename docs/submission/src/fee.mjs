// Fee helpers for the README. The formula itself lives in shared/src/units.ts (plan 04), the TypeScript
// mirror of ClimFeeMath that the bots also use (the app ships its own port, app/src/lib/feeMath.ts); Node 22 imports it directly (type stripping).
export {
  SECONDS_PER_YEAR,
  feePips,
  pipsToBp,
  annualSigmaToSigmaE9 as sigmaE9FromAnnual,
  sigmaE9ToAnnual as annualFromSigmaE9,
} from "../../../shared/src/units.ts";
import { SECONDS_PER_YEAR } from "../../../shared/src/units.ts";

// Annual volatility (fraction) above which the formula rises above the floor.
export function floorCrossoverAnnual({ etaE4, sqrtHalfDtE6, feeMinPips }) {
  return (feeMinPips / 1e6 / ((etaE4 / 1e4) * (sqrtHalfDtE6 / 1e6))) * Math.sqrt(SECONDS_PER_YEAR);
}
