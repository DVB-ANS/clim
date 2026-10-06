"""Fee policy: integer mirror of ClimFeeMath.feePips and of the RiskDesk sigma envelope."""

from dataclasses import dataclass

from . import units
from .constants import (
    BLOCK_SEC,
    FEE_DENOM,
    FEE_MAX_PIPS,
    FEE_MIN_PIPS,
    FEE_SAFE_PIPS,
    K_E4_ONE,
    SIGMA_MAX_E9,
    SIGMA_MIN_E9,
    TAU_KILL_SEC,
)


def fee_pips(sigma_e9: int, eta_e4: int, sqrt_half_dt_e6: int, k_e4: int, fee_min_pips: int, fee_max_pips: int) -> int:
    """clamp(ceil(sigmaE9 * etaE4 * sqrtHalfDtE6 * kE4 / 1e17), feeMinPips, feeMaxPips)."""
    num = sigma_e9 * eta_e4 * sqrt_half_dt_e6 * k_e4
    raw = -(-num // FEE_DENOM)
    if raw < fee_min_pips:
        return fee_min_pips
    if raw > fee_max_pips:
        return fee_max_pips
    return raw


def envelope(sigma_report_e9: int, prev_e9: int) -> int:
    """RiskDesk envelope: clamp(report, max(MIN, prev*8/10), min(MAX, 2*prev)); first report: clamp(report, MIN, MAX)."""
    if prev_e9 == 0:
        lo, hi = SIGMA_MIN_E9, SIGMA_MAX_E9
    else:
        lo = max(SIGMA_MIN_E9, prev_e9 * 8 // 10)
        hi = min(SIGMA_MAX_E9, 2 * prev_e9)
    return min(max(sigma_report_e9, lo), hi)


@dataclass(frozen=True)
class HookParams:
    p_star: float
    eta_e4: int
    sqrt_half_dt_e6: int
    fee_min_pips: int = FEE_MIN_PIPS
    fee_max_pips: int = FEE_MAX_PIPS
    fee_safe_pips: int = FEE_SAFE_PIPS
    tau_kill_sec: int = TAU_KILL_SEC

    @classmethod
    def from_pstar(cls, p_star: float, block_sec: int = BLOCK_SEC) -> "HookParams":
        return cls(p_star=p_star, eta_e4=units.eta_e4(p_star), sqrt_half_dt_e6=units.sqrt_half_dt_e6(block_sec))

    @classmethod
    def from_json(cls, d: dict) -> "HookParams":
        """Build from shared/params.json."""
        return cls(
            d["pStar"],
            d["etaE4"],
            d["sqrtHalfDtE6"],
            d["feeMinPips"],
            d["feeMaxPips"],
            d["feeSafePips"],
            d["tauKillSec"],
        )

    def fee(self, sigma_e9: int, k_e4: int = K_E4_ONE) -> int:
        return fee_pips(sigma_e9, self.eta_e4, self.sqrt_half_dt_e6, k_e4, self.fee_min_pips, self.fee_max_pips)
