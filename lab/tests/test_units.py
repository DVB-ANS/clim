import math

from clim_lab import units
from clim_lab.constants import SIGMA_MAX_E9, SIGMA_MIN_E9


def test_sigma_conversions_match_design_examples():
    assert units.sigma_e9_from_annual(0.48) == 85_475
    assert units.sigma_e9_from_annual(0.25) == 44_518
    assert units.sigma_e9_from_annual(1.00) == 178_072
    assert units.sigma_e9_from_annual(2.25) == 400_663
    assert units.sigma_e9_from_annual(0.10) == SIGMA_MIN_E9
    # SIGMA_MAX_E9 = 1,780,730 is the canonical RiskDesk bound (1000.003 %/yr); 1000 %/yr itself is 1,780,724
    assert units.sigma_e9_from_annual(10.0) == 1_780_724
    assert math.isclose(units.sigma_annual_from_e9(SIGMA_MAX_E9), 10.0, rel_tol=1e-5)
    assert math.isclose(units.sigma_annual_from_e9(85_475), 0.48, rel_tol=1e-5)


def test_eta_and_block_constants():
    assert units.eta_e4(0.1) == 91_760
    assert units.eta_e4(0.2) == 41_760
    assert units.eta_e4(0.3) == 25_093
    assert units.sqrt_half_dt_e6(12) == 2_449_490
    assert math.isclose(units.eta_from_pstar(0.3), 2.509333, rel_tol=1e-6)


def test_fee_units():
    assert units.pips_to_bp(500) == 5.0
    assert units.pips_to_fraction(500) == 0.0005
    assert math.isclose(units.log_band(0.0005), 0.000500125, rel_tol=1e-6)
