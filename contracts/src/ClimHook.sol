// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/base/BaseHook.sol";
import {BaseOverrideFee} from "@openzeppelin/uniswap-hooks/fee/BaseOverrideFee.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {IRiskDesk, FLAG_DEGRADED} from "./interfaces/IRiskDesk.sol";
import {ClimFeeMath} from "./libraries/ClimFeeMath.sol";

/// @title ClimHook
/// @notice Uniswap v4 hook that quotes a symmetric LP fee from the clim risk desk on every swap:
///         fee = clamp(ceil(eta * k * sigma * sqrt(blockTime / 2)), feeMin, feeMax),
///         raised to at least feeSafe when the desk is blind (silent > tauKillSec, or never reported)
///         or degraded (venues disagree). All parameters are immutable: one hook = one risk profile.
contract ClimHook is BaseOverrideFee {
    uint8 public constant MODE_NORMAL = 0;
    uint8 public constant MODE_DEGRADED = 1;
    uint8 public constant MODE_BLIND = 2;

    IRiskDesk public immutable desk;
    uint32 public immutable etaE4;
    uint32 public immutable sqrtHalfDtE6;
    uint24 public immutable feeMinPips;
    uint24 public immutable feeMaxPips;
    uint24 public immutable feeSafePips;
    uint32 public immutable tauKillSec;

    error InvalidParams();

    constructor(
        IPoolManager poolManager_,
        IRiskDesk desk_,
        uint32 etaE4_,
        uint32 sqrtHalfDtE6_,
        uint24 feeMinPips_,
        uint24 feeMaxPips_,
        uint24 feeSafePips_,
        uint32 tauKillSec_
    ) BaseHook(poolManager_) {
        if (
            address(desk_) == address(0) || etaE4_ == 0 || sqrtHalfDtE6_ == 0 || tauKillSec_ == 0 || feeMinPips_ == 0
                || feeMinPips_ > feeSafePips_ || feeSafePips_ > feeMaxPips_ || feeMaxPips_ > LPFeeLibrary.MAX_LP_FEE
        ) revert InvalidParams();
        desk = desk_;
        etaE4 = etaE4_;
        sqrtHalfDtE6 = sqrtHalfDtE6_;
        feeMinPips = feeMinPips_;
        feeMaxPips = feeMaxPips_;
        feeSafePips = feeSafePips_;
        tauKillSec = tauKillSec_;
    }

    /// @notice The fee the next swap will pay, in pips (1 bp = 100 pips), and why.
    /// @return fee LP fee in pips.
    /// @return mode MODE_NORMAL, MODE_DEGRADED or MODE_BLIND.
    function quoteFee() public view returns (uint24 fee, uint8 mode) {
        (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags,) = desk.state();
        fee = ClimFeeMath.feePips(sigmaE9, etaE4, sqrtHalfDtE6, kE4, feeMinPips, feeMaxPips);
        if (tObs == 0 || block.timestamp > uint256(tObs) + tauKillSec) {
            return (fee > feeSafePips ? fee : feeSafePips, MODE_BLIND);
        }
        if (flags & FLAG_DEGRADED != 0) {
            return (fee > feeSafePips ? fee : feeSafePips, MODE_DEGRADED);
        }
        return (fee, MODE_NORMAL);
    }

    function _getFee(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (uint24 fee)
    {
        (fee,) = quoteFee();
    }
}
