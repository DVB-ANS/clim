// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {ClimScript} from "./base/ClimScript.sol";

/// @notice Initializes the twin pools of a suite at the same price:
///         V = dynamic fee + ClimHook, S = static fee equal to V's expected time-average fee (params.json).
///         The live and replay S pools must have different static fees, or their PoolKeys collide.
/// Env: SUITE (live | replay), PARAMS_PATH, INIT_ETH_USD (whole dollars, e.g. 2713).
contract CreatePools is ClimScript {
    function run() external {
        _requirePoolSuite();
        uint256 pk = _pk();
        uint24 staticFee = _staticFee(_isReplay());
        require(staticFee > 0 && staticFee <= LPFeeLibrary.MAX_LP_FEE, "CreatePools: static fee out of range");
        // One token pair serves both suites: the replay S PoolKey differs from the live S one only by its fee.
        if (_isReplay()) {
            require(staticFee != _staticFee(false), "CreatePools: replay S fee must differ from live S fee");
        }

        address teth = _readAddress(_path("tokens"), ".tETH");
        address tusd = _readAddress(_path("tokens"), ".tUSD");
        address hook = _readAddress(_suitePath("hook"), ".hook");
        bool token0IsEth = teth < tusd;
        (Currency c0, Currency c1) =
            token0IsEth ? (Currency.wrap(teth), Currency.wrap(tusd)) : (Currency.wrap(tusd), Currency.wrap(teth));

        uint256 ethUsd = vm.envUint("INIT_ETH_USD");
        uint160 sqrtPriceX96 = sqrtPriceX96FromEthUsd(ethUsd, token0IsEth);

        PoolKey memory keyV = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, TICK_SPACING, IHooks(hook));
        PoolKey memory keyS = PoolKey(c0, c1, staticFee, TICK_SPACING, IHooks(address(0)));

        vm.startBroadcast(pk);
        IPoolManager(POOL_MANAGER).initialize(keyV, sqrtPriceX96);
        IPoolManager(POOL_MANAGER).initialize(keyS, sqrtPriceX96);
        vm.stopBroadcast();

        string memory o = "pools";
        vm.serializeString(o, "V", _keyJson("V", keyV));
        vm.serializeString(o, "S", _keyJson("S", keyS));
        vm.serializeUint(o, "initEthUsd", ethUsd);
        string memory json = vm.serializeUint(o, "sqrtPriceX96", sqrtPriceX96);
        _write(_suitePath("pools"), json);
    }

    /// @dev Both tokens have 18 decimals, so the raw price is the human price: token1 per token0.
    function sqrtPriceX96FromEthUsd(uint256 ethUsd, bool token0IsEth) public pure returns (uint160) {
        require(ethUsd > 0 && ethUsd < 1e9, "CreatePools: INIT_ETH_USD out of range");
        uint256 ratioX192 = token0IsEth ? ethUsd << 192 : (uint256(1) << 192) / ethUsd;
        return uint160(Math.sqrt(ratioX192));
    }

    function _keyJson(string memory o, PoolKey memory k) internal returns (string memory) {
        vm.serializeAddress(o, "currency0", Currency.unwrap(k.currency0));
        vm.serializeAddress(o, "currency1", Currency.unwrap(k.currency1));
        vm.serializeUint(o, "fee", k.fee);
        vm.serializeInt(o, "tickSpacing", k.tickSpacing);
        vm.serializeAddress(o, "hooks", address(k.hooks));
        return vm.serializeBytes32(o, "poolId", PoolId.unwrap(k.toId()));
    }
}
