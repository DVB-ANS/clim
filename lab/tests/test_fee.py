import pytest

from clim_lab.fee import HookParams, envelope, fee_pips

# Cross-check vectors, identical to contracts/test/ClimFeeMath.t.sol (plan 01).
# (sigmaE9, etaE4, sqrtHalfDtE6, kE4, feeMinPips, feeMaxPips, expected)
VECTORS = [
    (85_475, 91_761, 2_449_490, 10_000, 500, 15_000, 1_922),  # 48%/yr, P*=10%: raw 1921.20, ceil -> 1922
    (44_518, 91_761, 2_449_490, 10_000, 500, 15_000, 1_001),  # 25%/yr, P*=10%: raw 1000.62
    (178_072, 41_760, 2_449_490, 10_000, 500, 15_000, 1_822),  # 100%/yr, P*=20%
    (178_072, 25_093, 2_449_490, 10_000, 500, 15_000, 1_095),  # 100%/yr, P*=30%
    (400_663, 41_760, 2_449_490, 10_000, 500, 15_000, 4_099),  # 225%/yr, P*=20%
    (400_663, 25_093, 2_449_490, 10_000, 500, 15_000, 2_463),  # 225%/yr, P*=30%
    (48_880, 41_760, 2_449_490, 10_000, 500, 15_000, 500),  # 27.45%/yr, P*=20%: last sigma on the floor
    (48_881, 41_760, 2_449_490, 10_000, 500, 15_000, 501),  # first sigma above the floor
    (81_347, 25_093, 2_449_490, 10_000, 500, 15_000, 500),  # 45.68%/yr, P*=30%: last sigma on the floor
    (81_348, 25_093, 2_449_490, 10_000, 500, 15_000, 501),  # first sigma above the floor
    (17_807, 25_093, 2_449_490, 10_000, 500, 15_000, 500),  # SIGMA_MIN: floor
    (1_780_730, 41_760, 2_449_490, 20_000, 500, 15_000, 15_000),  # SIGMA_MAX, k=2: cap
    (0, 41_760, 2_449_490, 10_000, 500, 15_000, 500),  # zero sigma: floor
]


@pytest.mark.parametrize("sigma,eta,sq,k,lo,hi,expected", VECTORS)
def test_fee_pips_vectors(sigma, eta, sq, k, lo, hi, expected):
    assert fee_pips(sigma, eta, sq, k, lo, hi) == expected


def test_fee_is_ceiling_not_rounding():
    assert fee_pips(10**5, 10**4, 10**4, 10**4, 0, 10**6) == 1
    assert fee_pips(10**5 + 1, 10**4, 10**4, 10**4, 0, 10**6) == 2


def test_envelope_first_report_clamps_to_absolute_bounds():
    assert envelope(5_000, 0) == 17_807
    assert envelope(90_000, 0) == 90_000
    assert envelope(9_999_999, 0) == 1_780_730


def test_envelope_rises_at_most_2x_and_falls_at_most_20pct():
    assert envelope(500_000, 100_000) == 200_000
    assert envelope(10_000, 100_000) == 80_000
    assert envelope(95_000, 100_000) == 95_000
    assert envelope(10_000, 20_000) == 17_807
    assert envelope(1, 85_475) == 68_380
    assert envelope(9_999_999, 1_000_000) == 1_780_730


def test_hook_params_from_pstar():
    p = HookParams.from_pstar(0.3)
    assert (p.eta_e4, p.sqrt_half_dt_e6, p.fee_min_pips, p.fee_max_pips, p.fee_safe_pips, p.tau_kill_sec) == (
        25_093,
        2_449_490,
        500,
        15_000,
        3_000,
        180,
    )
    assert p.fee(178_072) == 1_095


def test_hook_params_from_json():
    d = {
        "pStar": 0.3,
        "etaE4": 25_093,
        "sqrtHalfDtE6": 2_449_490,
        "feeMinPips": 500,
        "feeMaxPips": 15_000,
        "feeSafePips": 3_000,
        "tauKillSec": 180,
    }
    assert HookParams.from_json(d) == HookParams.from_pstar(0.3)
