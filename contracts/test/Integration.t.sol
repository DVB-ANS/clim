// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {ClimHook} from "../src/ClimHook.sol";
import {RiskDesk} from "../src/RiskDesk.sol";
import {HookHelpers} from "./utils/HookHelpers.sol";

/// @notice One storm, end to end: CRE reports -> RiskDesk -> ClimHook -> pool V, next to static pool S.
contract IntegrationTest is HookHelpers {
    using StateLibrary for IPoolManager;

    uint24 internal constant STATIC_FEE = 1_000; // S charges the time-average fee of V (10 bp here)

    RiskDesk internal desk;
    ClimHook internal hook;
    PoolKey internal keyV;
    PoolKey internal keyS;

    function setUp() public {
        vm.warp(T0);
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        desk = new RiskDesk(forwarder, operator, false);
        hook = _deployHook(desk);
        (keyV,) = initPool(
            currency0, currency1, IHooks(address(hook)), LPFeeLibrary.DYNAMIC_FEE_FLAG, TICK_SPACING, SQRT_PRICE_1_1
        );
        (keyS,) = initPool(currency0, currency1, IHooks(address(0)), STATIC_FEE, TICK_SPACING, SQRT_PRICE_1_1);
        _addFullRange(keyV, LIQ);
        _addFullRange(keyS, LIQ);
    }

    function _assertTwinFees(uint24 expectedV, uint8 expectedMode) internal {
        (uint24 quoted, uint8 mode) = hook.quoteFee();
        assertEq(quoted, expectedV, "V quote");
        assertEq(mode, expectedMode, "V mode");
        assertEq(_swapFee(keyV, true, -1e18), expectedV, "V swap fee");
        assertEq(_swapFee(keyS, true, -1e18), STATIC_FEE, "S swap fee");
        // round trip so both pools stay near the same price
        _swapFee(keyV, false, -1e18);
        _swapFee(keyS, false, -1e18);
    }

    function test_TwinPoolsHaveTheSameLiquidity() public view {
        assertEq(manager.getLiquidity(keyV.toId()), manager.getLiquidity(keyS.toId()));
        assertEq(manager.getLiquidity(keyV.toId()), LIQ);
    }

    function test_StormLifecycle() public {
        // 1. Desk never reported: V quotes the safe fee.
        _assertTwinFees(FEE_SAFE, hook.MODE_BLIND());

        // 2. Calm market (48 %/yr): V quotes 5.26 bp, next to the 5 bp market tier.
        _deliver(desk, _report(T0, SIGMA_48));
        _assertTwinFees(526, hook.MODE_NORMAL());

        // 3. Storm: volatility doubles each report (envelope cap), the fee follows 30 s later.
        uint24[3] memory expected = [uint24(1051), 2102, 4203]; // 96 %, 192 %, 384 %/yr at P* = 30 %
        for (uint256 i; i < 3; i++) {
            uint40 t = T0 + uint40(30 * (i + 1));
            vm.warp(t);
            _deliver(desk, _report(t, 2_000_000)); // venues report far more than the envelope allows
            _assertTwinFees(expected[i], hook.MODE_NORMAL());
        }

        // 4. A third party pushes sigma = 0 through the mock forwarder: rejected, fee unchanged.
        vm.warp(T0 + 120);
        vm.prank(forwarder, attacker);
        vm.expectRevert(abi.encodeWithSelector(RiskDesk.NotSimOperator.selector, attacker));
        desk.onReport("", _report(T0 + 120, 0));
        _assertTwinFees(4203, hook.MODE_NORMAL());

        // 5. The desk goes silent for longer than tauKill: blind, the storm fee stays (above the safe fee).
        vm.warp(T0 + 90 + TAU_KILL + 1);
        _assertTwinFees(4203, hook.MODE_BLIND());

        // 6. The desk comes back after the storm: volatility can only decay 20 % per report.
        uint40 back = T0 + 90 + TAU_KILL + 1;
        _deliver(desk, _report(back, SIGMA_48));
        (, uint32 sigmaE9,,,) = desk.state();
        assertEq(sigmaE9, 547_040); // 683_800 * 0.8
        _assertTwinFees(3363, hook.MODE_NORMAL());
    }
}
