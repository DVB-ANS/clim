// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {CreatePools} from "../script/03_CreatePools.s.sol";

contract CreatePoolsTest is Test {
    CreatePools internal script = new CreatePools();

    /// ln(4000) / ln(1.0001) = 82_944.6: the pool tick is the refTick the CRE workflow must publish.
    function test_TickWhenEthIsToken0() public view {
        uint160 sqrtP = script.sqrtPriceX96FromEthUsd(4000, true);
        assertEq(TickMath.getTickAtSqrtPrice(sqrtP), 82_944);
    }

    function test_TickWhenEthIsToken1() public view {
        uint160 sqrtP = script.sqrtPriceX96FromEthUsd(4000, false);
        assertEq(TickMath.getTickAtSqrtPrice(sqrtP), -82_945);
    }

    function test_RevertWhen_PriceIsZero() public {
        vm.expectRevert(bytes("CreatePools: INIT_ETH_USD out of range"));
        script.sqrtPriceX96FromEthUsd(0, true);
    }
}
