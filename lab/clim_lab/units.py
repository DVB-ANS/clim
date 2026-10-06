"""Unit conversions. Mirrors shared/src/units.ts: keep both in sync."""

import math

from .constants import C_NT, SECONDS_PER_YEAR

SQRT_YEAR = math.sqrt(SECONDS_PER_YEAR)


def round_half_up(x: float) -> int:
    """Same as JavaScript Math.round for the positive values used here."""
    return math.floor(x + 0.5)


def annual_to_per_sqrt_s(sigma_annual: float) -> float:
    return sigma_annual / SQRT_YEAR


def per_sqrt_s_to_annual(sigma: float) -> float:
    return sigma * SQRT_YEAR


def sigma_e9_from_per_sqrt_s(sigma: float) -> int:
    return round_half_up(sigma * 1e9)


def sigma_e9_from_annual(sigma_annual: float) -> int:
    return sigma_e9_from_per_sqrt_s(annual_to_per_sqrt_s(sigma_annual))


def sigma_annual_from_e9(sigma_e9: int) -> float:
    return per_sqrt_s_to_annual(sigma_e9 / 1e9)


def eta_from_pstar(p_star: float) -> float:
    return 1.0 / p_star - C_NT


def eta_e4(p_star: float) -> int:
    return round_half_up(eta_from_pstar(p_star) * 1e4)


def sqrt_half_dt_e6(block_sec: float) -> int:
    return round_half_up(math.sqrt(block_sec / 2.0) * 1e6)


def pips_to_bp(pips: float) -> float:
    return pips / 100.0


def pips_to_fraction(pips: float) -> float:
    return pips / 1_000_000.0


def log_band(fee_fraction: float) -> float:
    """MMR gamma = -ln(1 - f): the no-arbitrage half-width in log price for a fee charged on the input."""
    return -math.log1p(-fee_fraction)
