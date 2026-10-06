"""Basel-style backtest of the P_trade prediction with thresholds simulated from the model itself.

Under the model (Gaussian increments with the desk's sigma, myopic arbitrage, fixed blocks) arbitraged
blocks cluster: after an arbitraged block the pool sits on the band edge, so the next block is arbitraged
about half the time. Exceptions are therefore not independent and binomial (textbook) thresholds are too
tight. We simulate the null model block by block, conditional on the real fee and sigma paths and on the
real pool state at the start of each window, and read the thresholds off the simulated distribution.
"""

import math

import numpy as np

from .constants import C_NT

GREEN, YELLOW, RED = "green", "yellow", "red"
Q_YELLOW, Q_RED = 0.95, 0.9999


def zone_from_cdf(cdf: float) -> str:
    return GREEN if cdf < Q_YELLOW else (YELLOW if cdf < Q_RED else RED)


def binom_cdf(x: int, n: int, p: float) -> float:
    return float(sum(math.comb(n, k) * p**k * (1.0 - p) ** (n - k) for k in range(x + 1)))


def binom_thresholds(n: int, p: float) -> tuple[int, int]:
    """Smallest counts whose cumulative probability reaches 95 % and 99.99 %."""
    cdf, yellow, red = 0.0, None, None
    for k in range(n + 1):
        cdf += math.comb(n, k) * p**k * (1.0 - p) ** (n - k)
        if yellow is None and cdf >= Q_YELLOW:
            yellow = k
        if cdf >= Q_RED:
            red = k
            break
    return yellow, red if red is not None else n


def kupiec_pof(x: int, n: int, p: float) -> tuple[float, float]:
    """Kupiec (1995) proportion-of-failures LR and its chi2(1) p-value (assumes independent exceptions)."""
    ph = x / n

    def ll(q: float) -> float:
        a = (n - x) * math.log(1.0 - q) if x < n else 0.0
        b = x * math.log(q) if x > 0 else 0.0
        return a + b

    lr = max(0.0, -2.0 * (ll(p) - ll(ph)))
    return lr, math.erfc(math.sqrt(lr / 2.0))


def simulate_null(
    sigma: np.ndarray,
    g: np.ndarray,
    z0: float,
    n_sims: int,
    rng: np.random.Generator,
    block_sec: float,
    count_from: int = 0,
):
    """Simulate the mispricing z = x - p under the model. Returns per-sim (exceptions, arb, n11, n1, n01, n0).

    n11: arbitraged blocks following an arbitraged block; n1: blocks following an arbitraged block;
    n01/n0: the same after a non-arbitraged block. Blocks before `count_from` are a burn-in and are not counted.
    """
    z = np.full(n_sims, float(z0))
    exc = np.zeros(n_sims, dtype=np.int64)
    arb = np.zeros(n_sims)
    prev = np.zeros(n_sims, dtype=bool)
    n11 = np.zeros(n_sims, dtype=np.int64)
    n1 = np.zeros(n_sims, dtype=np.int64)
    n01 = np.zeros(n_sims, dtype=np.int64)
    sd = sigma * math.sqrt(block_sec)
    for k in range(len(g)):
        z += sd[k] * rng.standard_normal(n_sims)
        gk = g[k]
        hit = np.abs(z) > gk
        if k >= count_from:
            d = np.where(hit, np.abs(z) - gk, 0.0)
            arb += 0.5 * d * d
            exc += hit
            if k > count_from:
                n1 += prev
                n11 += prev & hit
                n01 += (~prev) & hit
        z = np.clip(z, -gk, gk)
        prev = hit
    n0 = (len(g) - count_from - 1) - n1
    return exc, arb, n11, n1, n01, n0


def backtest_windows(
    traded, arb_by_block, z_pre, sigma, g, pred, window: int, n_sims: int, seed: int, block_sec: float
) -> list[dict]:
    rng = np.random.default_rng(seed)
    out = []
    for a in range(0, len(g) - window + 1, window):
        b = a + window
        z0 = 0.0 if a == 0 else float(np.clip(z_pre[a - 1], -g[a - 1], g[a - 1]))
        exc, arb, *_ = simulate_null(sigma[a:b], g[a:b], z0, n_sims, rng, block_sec)
        x = int(traded[a:b].sum())
        p_bar = float(pred[a:b].mean())
        lvr_model = float(np.sum(0.5 * sigma[a:b] ** 2 * block_sec))
        sev = float(arb_by_block[a:b].sum()) / lvr_model
        sev_sim = arb / lvr_model
        y_bin, r_bin = binom_thresholds(window, p_bar)
        sorted_exc = np.sort(exc)
        y_sim = int(sorted_exc[int(math.ceil(Q_YELLOW * n_sims)) - 1])
        r_sim = int(sorted_exc[int(math.ceil(Q_RED * n_sims)) - 1])
        out.append(
            {
                "startIndex": a,
                "exceptions": x,
                "predicted": p_bar,
                "binomialYellowFrom": y_bin,
                "binomialRedFrom": r_bin,
                "binomialZone": zone_from_cdf(binom_cdf(x, window, p_bar)),
                "simulatedYellowFrom": y_sim,
                "simulatedRedFrom": r_sim,
                "simulatedZone": zone_from_cdf(float(np.mean(exc <= x))),
                "simulatedMeanExceptions": float(exc.mean()),
                "severity": sev,
                "severitySimYellowFrom": float(np.quantile(sev_sim, Q_YELLOW)),
                "severitySimRedFrom": float(np.quantile(sev_sim, Q_RED)),
                "severityZone": zone_from_cdf(float(np.mean(sev_sim <= sev))),
            }
        )
    return out


def zone_counts(windows: list[dict], key: str) -> dict:
    return {z: sum(1 for w in windows if w[key] == z) for z in (GREEN, YELLOW, RED)}


BAND_METHOD = (
    "model simulation: Gaussian increments, fixed blocks, myopic arbitrage (clustered exceptions), "
    "{n_sims} paths of {window} blocks after a {burn_in}-block burn-in; quantiles of the observed frequency"
)


def ptrade_band(p_grid, window: int, n_sims: int, seed: int, burn_in: int = 100) -> list[dict]:
    """For each predicted per-block frequency p: 2.5/97.5 % and 0.5/99.5 % quantiles of the observed frequency
    over `window` blocks, simulated under the model with constant sigma and fee (eta = 1/p - C_NT)."""
    rng = np.random.default_rng(seed)
    rows = []
    for p in p_grid:
        eta = 1.0 / p - C_NT
        sigma = np.ones(burn_in + window)
        g = np.full(burn_in + window, eta * math.sqrt(0.5))
        exc, *_ = simulate_null(sigma, g, 0.0, n_sims, rng, 1.0, count_from=burn_in)
        q = np.quantile(exc / window, [0.025, 0.975, 0.005, 0.995])
        rows.append({"p": float(p), "lo95": float(q[0]), "hi95": float(q[1]), "lo99": float(q[2]), "hi99": float(q[3])})
    return rows
