"""Closed-form predictions: Milionis-Moallemi-Roughgarden 2023 (Poisson blocks), Nezlobin-Tassy 2025 (fixed blocks)."""

import math

import numpy as np

from .constants import C_ARB, C_NT


def eta(g, sigma, block_sec: float):
    """Fee in standard deviations of the price move over half a block: g / (sigma * sqrt(dt/2))."""
    return np.asarray(g) / (np.asarray(sigma) * math.sqrt(block_sec / 2.0))


def p_trade_poisson(eta_):
    return 1.0 / (1.0 + np.asarray(eta_))


def p_trade_fixed(eta_):
    return 1.0 / (np.asarray(eta_) + C_NT)


def arb_over_lvr_poisson(eta_):
    return 1.0 / (1.0 + np.asarray(eta_))


def arb_over_lvr_fixed(eta_):
    return 1.0 / (1.0 + C_ARB * np.asarray(eta_))


def sigma_arb(mean_g: float, p_hat: float, block_sec: float) -> float:
    """Volatility (per sqrt second) that reproduces the observed arbitrage frequency p_hat at mean band mean_g."""
    return mean_g / ((1.0 / p_hat - C_NT) * math.sqrt(block_sec / 2.0))
