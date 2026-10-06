// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TestToken} from "../src/test-tokens/TestToken.sol";

contract TestTokenTest is Test {
    TestToken internal token;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        token = new TestToken("clim test ETH", "tETH", owner, 10e18);
    }

    function test_Metadata() public view {
        assertEq(token.name(), "clim test ETH");
        assertEq(token.symbol(), "tETH");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), owner);
        assertEq(token.faucetAmount(), 10e18);
        assertEq(token.FAUCET_COOLDOWN(), 1 hours);
    }

    function test_OwnerMints() public {
        vm.prank(owner);
        token.mint(alice, 5e18);
        assertEq(token.balanceOf(alice), 5e18);
        assertEq(token.totalSupply(), 5e18);
    }

    function test_RevertWhen_NonOwnerMints() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1);
    }

    function test_FaucetMintsFixedAmount() public {
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 10e18);
        assertEq(token.lastFaucetAt(alice), block.timestamp);
    }

    function test_RevertWhen_FaucetInCooldown() public {
        vm.prank(alice);
        token.faucet();
        uint256 nextAt = block.timestamp + 1 hours;
        vm.warp(nextAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TestToken.FaucetCooldown.selector, nextAt));
        token.faucet();
    }

    function test_FaucetWorksAgainAfterCooldown() public {
        vm.prank(alice);
        token.faucet();
        vm.warp(block.timestamp + 1 hours);
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 20e18);
    }
}
