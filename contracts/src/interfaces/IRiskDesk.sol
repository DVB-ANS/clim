// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Bit 0 of `flags`: venue dispersion above DISP_MAX_BP in the last report.
uint8 constant FLAG_DEGRADED = 1;
/// @dev Bit 1 of `flags`: set at construction on a desk fed by historical replay, never on a live desk.
uint8 constant FLAG_REPLAY = 2;

/// @title IRiskDesk
/// @notice Read side of the clim risk desk: the latest volatility published by the Chainlink CRE workflow.
interface IRiskDesk {
    /// @notice One accepted report. Every field of the CRE report is logged so the P&L explain can be rebuilt from logs.
    /// @param seq Report counter, starts at 1.
    /// @param tObs DON observation time (unix seconds).
    /// @param sigmaApplied Volatility stored after the envelope, per sqrt-second, times 1e9.
    /// @param sigmaReported Volatility as reported, per sqrt-second, times 1e9.
    /// @param rv15E9 15-minute realized volatility, per sqrt-second, times 1e9.
    /// @param dvolE2 Deribit DVOL index times 100.
    /// @param refTick Median venue price as a Uniswap tick of the clim pools.
    /// @param dispBp Venue dispersion in basis points.
    /// @param nSources Venues that passed the freshness filter.
    /// @param kE4 Model-risk multiplier applied, times 1e4 (clamped to [10_000, 20_000]).
    /// @param zone Backtest zone published by the workflow (0 not validated, 1 green, 2 yellow, 3 red). Logged only.
    event RiskReported(
        uint32 indexed seq,
        uint40 tObs,
        uint32 sigmaApplied,
        uint32 sigmaReported,
        uint32 rv15E9,
        uint16 dvolE2,
        int24 refTick,
        uint16 dispBp,
        uint8 nSources,
        uint16 kE4,
        uint8 zone
    );

    /// @notice Latest accepted state, packed in one storage slot.
    /// @return tObs Observation time of the last accepted report (0 = never reported).
    /// @return sigmaE9 Applied volatility, per sqrt-second, times 1e9.
    /// @return kE4 Applied model-risk multiplier, times 1e4.
    /// @return flags FLAG_DEGRADED | FLAG_REPLAY.
    /// @return seq Number of accepted reports.
    function state() external view returns (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq);
}
