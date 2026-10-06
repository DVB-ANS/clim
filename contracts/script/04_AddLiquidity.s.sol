// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {ClimScript} from "./base/ClimScript.sol";

/// @notice Adds the same full-range liquidity L to V and S through Sepolia's PoolModifyLiquidityTest.
///         L is sized so that each pool holds LIQ_TETH tETH at the initial price.
/// Env: SUITE (live | replay), LIQ_TETH (whole tokens per pool, default 100_000).
contract AddLiquidity is ClimScript {
    using StateLibrary for IPoolManager;

    function run() external {
        _requirePoolSuite();
        uint256 pk = _pk();
        string memory pools = vm.readFile(_suitePath("pools"));
        PoolKey memory keyV = _key(pools, ".V");
        PoolKey memory keyS = _key(pools, ".S");
        bool token0IsEth = _readAddress(_path("tokens"), ".tETH") < _readAddress(_path("tokens"), ".tUSD");

        int24 lower = TickMath.minUsableTick(TICK_SPACING);
        int24 upper = TickMath.maxUsableTick(TICK_SPACING);
        uint128 liquidity =
            _liquidityFor(keyV, token0IsEth, vm.envOr("LIQ_TETH", uint256(100_000)) * 1e18, lower, upper);
        ModifyLiquidityParams memory mlp = ModifyLiquidityParams({
            tickLower: lower, tickUpper: upper, liquidityDelta: int256(uint256(liquidity)), salt: 0
        });

        vm.startBroadcast(pk);
        IERC20(Currency.unwrap(keyV.currency0)).approve(POOL_MODIFY_LIQUIDITY_TEST, type(uint256).max);
        IERC20(Currency.unwrap(keyV.currency1)).approve(POOL_MODIFY_LIQUIDITY_TEST, type(uint256).max);
        PoolModifyLiquidityTest(POOL_MODIFY_LIQUIDITY_TEST).modifyLiquidity(keyV, mlp, "");
        PoolModifyLiquidityTest(POOL_MODIFY_LIQUIDITY_TEST).modifyLiquidity(keyS, mlp, "");
        vm.stopBroadcast();

        require(IPoolManager(POOL_MANAGER).getLiquidity(keyV.toId()) == liquidity, "AddLiquidity: V");
        require(IPoolManager(POOL_MANAGER).getLiquidity(keyS.toId()) == liquidity, "AddLiquidity: S");

        string memory o = "liquidity";
        vm.serializeUint(o, "liquidity", liquidity);
        vm.serializeInt(o, "tickLower", lower);
        string memory json = vm.serializeInt(o, "tickUpper", upper);
        _write(_suitePath("liquidity"), json);
    }

    /// @dev Full range: the tETH side of the position is [price, max] if tETH is token0, [min, price] otherwise.
    function _liquidityFor(PoolKey memory k, bool token0IsEth, uint256 ethAmount, int24 lower, int24 upper)
        internal
        view
        returns (uint128)
    {
        (uint160 sqrtP,,,) = IPoolManager(POOL_MANAGER).getSlot0(k.toId());
        require(sqrtP != 0, "AddLiquidity: pool not initialized");
        return token0IsEth
            ? LiquidityAmounts.getLiquidityForAmount0(sqrtP, TickMath.getSqrtPriceAtTick(upper), ethAmount)
            : LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(lower), sqrtP, ethAmount);
    }

    function _key(string memory json, string memory base) internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(vm.parseJsonAddress(json, string.concat(base, ".currency0"))),
            currency1: Currency.wrap(vm.parseJsonAddress(json, string.concat(base, ".currency1"))),
            fee: uint24(vm.parseJsonUint(json, string.concat(base, ".fee"))),
            tickSpacing: int24(vm.parseJsonInt(json, string.concat(base, ".tickSpacing"))),
            hooks: IHooks(vm.parseJsonAddress(json, string.concat(base, ".hooks")))
        });
    }
}
