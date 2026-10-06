// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

import {ClimScript} from "./base/ClimScript.sol";
import {TestToken} from "../src/test-tokens/TestToken.sol";

/// @notice Deploys tETH and tUSD (18 decimals), mints them to the deployer, and deploys the arbitrage router:
///         a second PoolSwapTest that only the arbitrage bot uses, so the dashboard can tell arbitrage swaps
///         from retail swaps by `Swap.sender` (plan 05). One token pair and one arbitrage router serve every suite.
///         Public faucet: 10 tETH and 25,000 tUSD per address per hour (TestToken.faucet, for the dashboard's /swap and /lp).
/// Env: MINT_TETH (whole tokens, default 1_000_000), MINT_TUSD (whole tokens, default 10_000_000_000).
contract DeployTokens is ClimScript {
    function run() external {
        uint256 pk = _pk();
        address deployer = vm.addr(pk);
        uint256 mintEth = vm.envOr("MINT_TETH", uint256(1_000_000)) * 1e18;
        uint256 mintUsd = vm.envOr("MINT_TUSD", uint256(10_000_000_000)) * 1e18;
        uint256 deployBlock = block.number;

        vm.startBroadcast(pk);
        TestToken teth = new TestToken("clim test ETH", "tETH", deployer, 10e18);
        TestToken tusd = new TestToken("clim test USD", "tUSD", deployer, 25_000e18);
        teth.mint(deployer, mintEth);
        tusd.mint(deployer, mintUsd);
        PoolSwapTest arbRouter = new PoolSwapTest(IPoolManager(POOL_MANAGER));
        vm.stopBroadcast();

        string memory o = "tokens";
        vm.serializeAddress(o, "tETH", address(teth));
        vm.serializeAddress(o, "tUSD", address(tusd));
        vm.serializeAddress(o, "arbRouter", address(arbRouter));
        string memory json = vm.serializeUint(o, "deployBlock", deployBlock);
        _write(_path("tokens"), json);
    }
}
