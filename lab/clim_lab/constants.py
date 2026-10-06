"""Protocol and unit constants. Values shared with contracts/ (ClimFeeMath, RiskDesk) and cre/."""

SECONDS_PER_YEAR = 31_536_000  # 365 days; same convention as shared/src/units.ts
C_NT = 0.824  # |zeta(1/2)|/sqrt(pi) = 0.82392 rounded as in the docs (Nezlobin-Tassy 2025, Cor. 3.1)
C_ARB = 1.2137  # sqrt(pi)/|zeta(1/2)|: fixed blocks, ARB/LVR = 1/(1 + C_ARB*eta) (Nezlobin-Tassy 2025)

BLOCK_SEC = 12  # Sepolia block time
REPORT_SEC = 30  # CRE cron period
LATENCY_SEC = 12  # a report is effective one block after its observation time
RV_RETURNS = 15  # RV15: 15 one-minute log returns
RV_WINDOW_SEC = 900

SIGMA_MIN_E9 = 17_807  # 10%/yr in per-sqrt-second * 1e9
SIGMA_MAX_E9 = 1_780_730  # 1000%/yr
K_E4_ONE = 10_000
FEE_DENOM = 10**17
FEE_MIN_PIPS = 500  # 5 bp: the ETH/USDC market fee tier
FEE_MAX_PIPS = 15_000  # 150 bp
FEE_SAFE_PIPS = 3_000  # 30 bp
TAU_KILL_SEC = 180  # simulation value (production: 120)
PSTAR_CANDIDATES = (0.2, 0.3)
