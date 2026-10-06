// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {ClimHook} from "../../src/ClimHook.sol";
import {IRiskDesk} from "../../src/interfaces/IRiskDesk.sol";
import {DeskHelpers} from "./DeskHelpers.sol";

/// @notice v4 fixtures shared by the hook and integration tests: a real PoolManager, a desk, a hook at a flag address.
abstract contract HookHelpers is Deployers, DeskHelpers {
    // Post-audit calibration used in tests: P* = 30 %, Sepolia 12 s blocks.
    uint32 internal constant ETA_E4 = 25_093;
    uint32 internal constant SQRT_HALF_DT_E6 = 2_449_490;
    uint24 internal constant FEE_MIN = 500;
    uint24 internal constant FEE_MAX = 15_000;
    uint24 internal constant FEE_SAFE = 3_000;
    uint32 internal constant TAU_KILL = 180;
    int24 internal constant TICK_SPACING = 60;
    uint128 internal constant LIQ = 1e21;

    /// @dev afterInitialize | beforeSwap, xor-ed high bits so the address is not a precompile.
    address internal constant HOOK_ADDRESS =
        address(uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG) ^ (0x4444 << 144));

    function _hookArgs(IRiskDesk desk_) internal view returns (bytes memory) {
        return abi.encode(manager, desk_, ETA_E4, SQRT_HALF_DT_E6, FEE_MIN, FEE_MAX, FEE_SAFE, TAU_KILL);
    }

    function _deployHook(IRiskDesk desk_) internal returns (ClimHook) {
        deployCodeTo("ClimHook.sol:ClimHook", _hookArgs(desk_), HOOK_ADDRESS);
        return ClimHook(HOOK_ADDRESS);
    }

    function _addFullRange(PoolKey memory k, uint128 liquidity) internal {
        modifyLiquidityRouter.modifyLiquidity(
            k,
            ModifyLiquidityParams({
                tickLower: TickMath.minUsableTick(TICK_SPACING),
                tickUpper: TickMath.maxUsableTick(TICK_SPACING),
                liquidityDelta: int256(uint256(liquidity)),
                salt: 0
            }),
            ZERO_BYTES
        );
    }

    /// @dev Swaps through PoolSwapTest and returns the `fee` field of PoolManager's Swap event: the fee actually charged.
    function _swapFee(PoolKey memory k, bool zeroForOne, int256 amountSpecified) internal returns (uint24 fee) {
        vm.recordLogs();
        swap(k, zeroForOne, amountSpecified, ZERO_BYTES);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(manager) && logs[i].topics[0] == IPoolManager.Swap.selector) {
                (,,,,, fee) = abi.decode(logs[i].data, (int128, int128, uint160, uint128, int24, uint24));
                return fee;
            }
        }
        revert("no Swap event");
    }
}
