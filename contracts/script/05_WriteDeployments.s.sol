// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IStateView} from "@uniswap/v4-periphery/src/interfaces/IStateView.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {ClimScript} from "./base/ClimScript.sol";
import {ClimHook} from "../src/ClimHook.sol";

/// @notice Read-only. Checks every deployed suite on-chain, then merges the step fragments of deployments/<chainId>/
///         into ../shared/deployments/sepolia.json (chain 11155111) or ../shared/deployments/anvil.json (other chains).
///         Output schema = the one plan 04's parseDeployments validates (including `routers.arb`), plus `deployer`,
///         `riskDesks.don` and `liquidity`.
contract WriteDeployments is ClimScript {
    function run() external {
        require(
            address(IStateView(STATE_VIEW).poolManager()) == POOL_MANAGER, "StateView does not point at PoolManager"
        );
        string memory tokens = vm.readFile(_path("tokens"));
        address teth = vm.parseJsonAddress(tokens, ".tETH");
        address tusd = vm.parseJsonAddress(tokens, ".tUSD");

        string memory head = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"deployBlock":',
            vm.toString(vm.parseJsonUint(tokens, ".deployBlock")),
            ',"deployer":',
            _q(vm.toString(vm.addr(_pk()))),
            ',"uniswap":{"poolManager":',
            _q(vm.toString(POOL_MANAGER)),
            ',"stateView":',
            _q(vm.toString(STATE_VIEW)),
            ',"poolSwapTest":',
            _q(vm.toString(POOL_SWAP_TEST)),
            ',"poolModifyLiquidityTest":',
            _q(vm.toString(POOL_MODIFY_LIQUIDITY_TEST)),
            "}"
        );
        string memory tokensJson = string.concat(
            ',"cre":{"mockForwarder":',
            _q(vm.toString(MOCK_FORWARDER)),
            ',"keystoneForwarder":',
            _q(vm.toString(KEYSTONE_FORWARDER)),
            '},"tokens":{"tETH":',
            _token(teth, "tETH"),
            ',"tUSD":',
            _token(tusd, "tUSD"),
            '},"routers":{"arb":',
            _arbRouterOrNull(tokens),
            "}"
        );
        string memory contractsJson = string.concat(
            ',"riskDesks":{"live":',
            _addrOrNull("desk-live", ".riskDesk"),
            ',"replay":',
            _addrOrNull("desk-replay", ".riskDesk"),
            ',"don":',
            _addrOrNull("desk-don", ".riskDesk"),
            '},"hooks":{"live":',
            _hookOrNull("live"),
            ',"replay":',
            _hookOrNull("replay"),
            "}"
        );
        bool token0IsEth = teth < tusd;
        string memory poolsJson = string.concat(
            ',"pools":{"liveV":',
            _poolOrNull("live", ".V", token0IsEth),
            ',"liveS":',
            _poolOrNull("live", ".S", token0IsEth),
            ',"replayV":',
            _poolOrNull("replay", ".V", token0IsEth),
            ',"replayS":',
            _poolOrNull("replay", ".S", token0IsEth),
            '},"liquidity":{"live":',
            _liquidityOrNull("live"),
            ',"replay":',
            _liquidityOrNull("replay"),
            "}}"
        );

        string memory out =
            block.chainid == SEPOLIA ? "../shared/deployments/sepolia.json" : "../shared/deployments/anvil.json";
        vm.writeJson(string.concat(head, tokensJson, contractsJson, poolsJson), out);
    }

    function _q(string memory s) internal pure returns (string memory) {
        return string.concat('"', s, '"');
    }

    function _token(address token, string memory symbol) internal pure returns (string memory) {
        return string.concat('{"address":', _q(vm.toString(token)), ',"symbol":', _q(symbol), ',"decimals":18}');
    }

    /// @dev The arbitrage-only PoolSwapTest deployed by 00_Tokens; checked to route through the PoolManager.
    function _arbRouterOrNull(string memory tokens) internal view returns (string memory) {
        if (!vm.keyExistsJson(tokens, ".arbRouter")) return "null";
        address router = vm.parseJsonAddress(tokens, ".arbRouter");
        require(address(PoolSwapTest(router).manager()) == POOL_MANAGER, "routers.arb does not point at PoolManager");
        return _q(vm.toString(router));
    }

    function _addrOrNull(string memory fragment, string memory key) internal view returns (string memory) {
        if (!vm.exists(_path(fragment))) return "null";
        return _q(vm.toString(_readAddress(_path(fragment), key)));
    }

    /// @dev Also checks that the hook reads the desk of the same suite.
    function _hookOrNull(string memory suite) internal view returns (string memory) {
        string memory hookPath = _path(string.concat("hook-", suite));
        if (!vm.exists(hookPath)) return "null";
        address hook = _readAddress(hookPath, ".hook");
        address desk = _readAddress(_path(string.concat("desk-", suite)), ".riskDesk");
        require(address(ClimHook(hook).desk()) == desk, string.concat(suite, ": hook reads another desk"));
        return _q(vm.toString(hook));
    }

    /// @dev Also checks that the pool is initialized and holds liquidity.
    function _poolOrNull(string memory suite, string memory which, bool token0IsEth)
        internal
        view
        returns (string memory)
    {
        string memory poolsPath = _path(string.concat("pools-", suite));
        if (!vm.exists(poolsPath)) return "null";
        string memory pools = vm.readFile(poolsPath);
        bytes32 poolId = vm.parseJsonBytes32(pools, string.concat(which, ".poolId"));
        (uint160 sqrtPriceX96,,,) = IStateView(STATE_VIEW).getSlot0(PoolId.wrap(poolId));
        require(sqrtPriceX96 != 0, string.concat(suite, which, ": pool not initialized"));
        require(
            IStateView(STATE_VIEW).getLiquidity(PoolId.wrap(poolId)) > 0, string.concat(suite, which, ": no liquidity")
        );

        return string.concat(
            '{"key":',
            _keyJson(pools, which),
            ',"poolId":',
            _q(vm.toString(poolId)),
            ',"token0IsEth":',
            token0IsEth ? "true" : "false",
            "}"
        );
    }

    function _keyJson(string memory pools, string memory which) internal pure returns (string memory) {
        string memory addrs = string.concat(
            '{"currency0":',
            _addrAt(pools, which, ".currency0"),
            ',"currency1":',
            _addrAt(pools, which, ".currency1"),
            ',"hooks":',
            _addrAt(pools, which, ".hooks")
        );
        return string.concat(
            addrs,
            ',"fee":',
            vm.toString(vm.parseJsonUint(pools, string.concat(which, ".fee"))),
            ',"tickSpacing":',
            vm.toString(vm.parseJsonInt(pools, string.concat(which, ".tickSpacing"))),
            "}"
        );
    }

    function _addrAt(string memory json, string memory which, string memory field)
        internal
        pure
        returns (string memory)
    {
        return _q(vm.toString(vm.parseJsonAddress(json, string.concat(which, field))));
    }

    /// @dev Decimal string: L exceeds 2^53 and would lose precision as a JSON number in JavaScript.
    function _liquidityOrNull(string memory suite) internal view returns (string memory) {
        string memory liqPath = _path(string.concat("liquidity-", suite));
        if (!vm.exists(liqPath)) return "null";
        return _q(vm.toString(vm.parseJsonUint(vm.readFile(liqPath), ".liquidity")));
    }
}
