"""Fables (Robinhood Chain) keeper fee: log decoding and the FablesRamp fee rule.

The rule mirrors FablesBaseHook._resolveFee with FablesRamp._autonomousFee = flatPips (verified source of
hook 0x06a889870c8f83640d6816319f72e2aa579b6080 on Sourcify, chain 4663):

    fee = flat
    if a poke is live (poke.expiry > block.timestamp):
        fee = max(poke.fee, pokeFloor, flat * (10000 - MAX_POKE_DISCOUNT_BPS) / 10000)
    fee = min(fee, maxFee)

Events (topic0 = keccak of the signature, computed with `cast keccak`; topic1 = poolId):
    FeePoked(bytes32 indexed poolId, uint24 fee, uint40 expiry)
    PokeCleared(bytes32 indexed poolId)
    PoolConfigured(bytes32 indexed poolId, uint24 floorPips, uint24 flatPips, uint24 maxFee)
    Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96,
         uint128 liquidity, int24 tick, uint24 fee)   (Uniswap v4 PoolManager; fee = LP fee when protocol fee is 0)

Logs are Etherscan getLogs rows (hex strings). Etherscan returns logIndex "0x" for some rows, so events are
ordered by (blockNumber, transactionIndex, logIndex with "0x" read as 0).
"""

from dataclasses import dataclass

import numpy as np

FEE_POKED_TOPIC = "0xcb123ffca193ebeb3d5c30d267785371dd417ff0084b636bff5d03f87a2c8e04"
POKE_CLEARED_TOPIC = "0xb8fae5f44b3e1ea6cb10a6d677d5a9441301da4f60509c3ecccf8c67d34a50cb"
POOL_CONFIGURED_TOPIC = "0x0cd5d07754e72da6a4377b10c0e71af087f26ee3d83fe1477267deb81b4a9fd5"
SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"
INITIALIZE_TOPIC = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438"

MAX_POKE_DISCOUNT_BPS = 5000  # FablesBaseHook constant: a poke may cut at most half of the flat fee


def hex_int(s: str) -> int:
    """Etherscan hex field to int; "0x" (seen for logIndex) reads as 0."""
    s = s.strip()
    return int(s, 16) if len(s) > 2 else 0


def data_words(data: str) -> list[int]:
    h = data[2:] if data.startswith("0x") else data
    if len(h) % 64:
        raise ValueError("log data is not a whole number of 32-byte words")
    return [int(h[i : i + 64], 16) for i in range(0, len(h), 64)]


def order_key(block: int, tx_index: int, log_index: int = 0) -> int:
    """One int64 that sorts events in chain order."""
    return (block << 32) | (tx_index << 16) | log_index


def _meta(log: dict) -> tuple[int, int, int, int, str]:
    return (
        hex_int(log["timeStamp"]),
        hex_int(log["blockNumber"]),
        hex_int(log["transactionIndex"]),
        hex_int(log.get("logIndex", "0x")),
        log["transactionHash"],
    )


@dataclass(frozen=True)
class Poke:
    t: int
    block: int
    tx_index: int
    log_index: int
    fee_pips: int
    expiry: int
    tx: str

    @property
    def key(self) -> int:
        return order_key(self.block, self.tx_index, self.log_index)


@dataclass(frozen=True)
class PoolConfig:
    t: int
    block: int
    tx_index: int
    log_index: int
    floor_pips: int
    flat_pips: int
    cap_pips: int
    tx: str

    @property
    def key(self) -> int:
        return order_key(self.block, self.tx_index, self.log_index)


@dataclass(frozen=True)
class SwapFee:
    t: int
    block: int
    tx_index: int
    log_index: int
    fee_pips: int
    tx: str

    @property
    def key(self) -> int:
        return order_key(self.block, self.tx_index, self.log_index)


def decode_feepoked(log: dict) -> Poke:
    if log["topics"][0].lower() != FEE_POKED_TOPIC:
        raise ValueError("not a FeePoked log")
    t, block, txi, li, tx = _meta(log)
    w = data_words(log["data"])
    return Poke(t, block, txi, li, w[0], w[1], tx)


def decode_poolconfigured(log: dict) -> PoolConfig:
    if log["topics"][0].lower() != POOL_CONFIGURED_TOPIC:
        raise ValueError("not a PoolConfigured log")
    t, block, txi, li, tx = _meta(log)
    w = data_words(log["data"])
    return PoolConfig(t, block, txi, li, w[0], w[1], w[2], tx)


def decode_swap_fee(log: dict) -> SwapFee:
    """The Swap event's last data word: the uint24 fee the swap was charged (pips)."""
    if log["topics"][0].lower() != SWAP_TOPIC:
        raise ValueError("not a Swap log")
    t, block, txi, li, tx = _meta(log)
    w = data_words(log["data"])
    return SwapFee(t, block, txi, li, w[-1] & 0xFFFFFF, tx)


def sorted_events(events: list) -> list:
    return sorted(events, key=lambda e: e.key)


def delay_pokes(pokes: list[Poke], sec: int) -> list[Poke]:
    """The same pokes sent `sec` seconds later (time-grid sensitivity: a slower keeper; expiry keeps its TTL)."""
    return [
        Poke(p.t + sec, p.block, p.tx_index, p.log_index, p.fee_pips, p.expiry + sec, p.tx) for p in pokes
    ]


def sample_on_blocks(change_t: np.ndarray, values: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Step function: the value of the last change at or before each t (a change at t applies at t)."""
    idx = np.searchsorted(np.asarray(change_t), np.asarray(t), side="right") - 1
    if np.any(idx < 0):
        raise ValueError("query before the first change")
    return np.asarray(values)[idx]


def keeper_fee_at(
    t: np.ndarray,
    pokes: list[Poke],
    configs: list[PoolConfig],
    clears_t: np.ndarray | None = None,
    query_keys: np.ndarray | None = None,
) -> np.ndarray:
    """LP fee (pips) the hook resolves at block timestamps t.

    Without query_keys, an event applies from its own timestamp on (sampling on a time grid). With query_keys
    (order_key of each query, e.g. each Swap log), the state is the one in force at that point in the chain,
    so a swap earlier in the same block as a poke still sees the previous poke.
    """
    t = np.asarray(t, dtype=np.int64)
    pokes = sorted_events(pokes)
    configs = sorted_events(configs)
    if not configs:
        raise ValueError("no PoolConfigured event")
    if query_keys is None:
        cfg_pos = np.array([c.t for c in configs], dtype=np.int64)
        pk_pos = np.array([p.t for p in pokes], dtype=np.int64)
        q = t
    else:
        cfg_pos = np.array([c.key for c in configs], dtype=np.int64)
        pk_pos = np.array([p.key for p in pokes], dtype=np.int64)
        q = np.asarray(query_keys, dtype=np.int64)
    ci = np.searchsorted(cfg_pos, q, side="right") - 1
    if np.any(ci < 0):
        raise ValueError("query before the pool was configured")
    floor = np.array([c.floor_pips for c in configs], dtype=np.int64)[ci]
    flat = np.array([c.flat_pips for c in configs], dtype=np.int64)[ci]
    cap = np.array([c.cap_pips for c in configs], dtype=np.int64)[ci]
    fee = flat.copy()
    if pokes:
        pi = np.searchsorted(pk_pos, q, side="right") - 1
        has = pi >= 0
        pic = np.clip(pi, 0, None)
        p_fee = np.array([p.fee_pips for p in pokes], dtype=np.int64)[pic]
        p_exp = np.array([p.expiry for p in pokes], dtype=np.int64)[pic]
        live = has & (p_exp > t)
        if clears_t is not None and len(clears_t):
            # a PokeCleared after the poke deletes it (time-grid semantics)
            p_t = np.array([p.t for p in pokes], dtype=np.int64)[pic]
            ct = np.sort(np.asarray(clears_t, dtype=np.int64))
            last_clear = ct[np.clip(np.searchsorted(ct, t, side="right") - 1, 0, None)]
            cleared = (np.searchsorted(ct, t, side="right") > 0) & (last_clear >= p_t)
            live &= ~cleared
        poke_floor = np.maximum(floor, flat * (10_000 - MAX_POKE_DISCOUNT_BPS) // 10_000)
        fee = np.where(live, np.maximum(p_fee, poke_floor), flat)
    return np.minimum(fee, cap)
