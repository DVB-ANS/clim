// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {BaseOverrideFee} from "@openzeppelin/uniswap-hooks/fee/BaseOverrideFee.sol";

import {ClimHook} from "../src/ClimHook.sol";
import {RiskDesk} from "../src/RiskDesk.sol";
import {ClimFeeMath} from "../src/libraries/ClimFeeMath.sol";
import {HookHelpers} from "./utils/HookHelpers.sol";

contract ClimHookTest is HookHelpers {
    RiskDesk internal desk;
    ClimHook internal hook;

    function setUp() public {
        vm.warp(T0);
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        desk = new RiskDesk(forwarder, operator, false);
        hook = _deployHook(desk);
        (key,) = initPool(
            currency0, currency1, IHooks(address(hook)), LPFeeLibrary.DYNAMIC_FEE_FLAG, TICK_SPACING, SQRT_PRICE_1_1
        );
        _addFullRange(key, LIQ);
    }

    function _expected(uint32 sigmaE9, uint16 kE4) internal pure returns (uint24) {
        return ClimFeeMath.feePips(sigmaE9, ETA_E4, SQRT_HALF_DT_E6, kE4, FEE_MIN, FEE_MAX);
    }

    // ---------------------------------------------------------------- configuration

    function test_PermissionsAreAfterInitializeAndBeforeSwapOnly() public view {
        Hooks.Permissions memory p = hook.getHookPermissions();
        assertTrue(p.afterInitialize);
        assertTrue(p.beforeSwap);
        assertFalse(p.beforeInitialize);
        assertFalse(p.afterSwap);
        assertFalse(p.beforeAddLiquidity);
        assertFalse(p.beforeSwapReturnDelta);
    }

    function test_ImmutablesMatchConstructorArgs() public view {
        assertEq(address(hook.poolManager()), address(manager));
        assertEq(address(hook.desk()), address(desk));
        assertEq(hook.etaE4(), ETA_E4);
        assertEq(hook.sqrtHalfDtE6(), SQRT_HALF_DT_E6);
        assertEq(hook.feeMinPips(), FEE_MIN);
        assertEq(hook.feeMaxPips(), FEE_MAX);
        assertEq(hook.feeSafePips(), FEE_SAFE);
        assertEq(hook.tauKillSec(), TAU_KILL);
    }

    function test_RevertWhen_FeeBoundsAreInconsistent() public {
        address target = address(uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG) ^ (0x5555 << 144));
        bytes memory badArgs =
            abi.encode(manager, desk, ETA_E4, SQRT_HALF_DT_E6, uint24(4_000), FEE_MAX, FEE_SAFE, TAU_KILL); // min > safe
        vm.expectRevert(ClimHook.InvalidParams.selector);
        deployCodeTo("ClimHook.sol:ClimHook", badArgs, target);

        bytes memory zeroFloor =
            abi.encode(manager, desk, ETA_E4, SQRT_HALF_DT_E6, uint24(0), FEE_MAX, FEE_SAFE, TAU_KILL); // floor 0
        vm.expectRevert(ClimHook.InvalidParams.selector);
        deployCodeTo("ClimHook.sol:ClimHook", zeroFloor, target);
    }

    function test_RevertWhen_PoolHasAStaticFee() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.afterInitialize.selector,
                abi.encodeWithSelector(BaseOverrideFee.NotDynamicFee.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        initPool(currency0, currency1, IHooks(address(hook)), 3000, TICK_SPACING, SQRT_PRICE_1_1);
    }

    // ---------------------------------------------------------------- quoteFee modes

    function test_BlindBeforeTheFirstReport() public view {
        (uint24 fee, uint8 mode) = hook.quoteFee();
        assertEq(fee, FEE_SAFE);
        assertEq(mode, hook.MODE_BLIND());
    }

    function test_NormalQuoteFollowsTheDesk() public {
        _deliver(desk, _report(T0, SIGMA_100));
        (uint24 fee, uint8 mode) = hook.quoteFee();
        assertEq(fee, 1095); // 100 %/yr at P* = 30 %: 10.95 bp
        assertEq(fee, _expected(SIGMA_100, 10_000));
        assertEq(mode, hook.MODE_NORMAL());
    }

    function test_CalmMarketPaysTheFloor() public {
        _deliver(desk, _report(T0, SIGMA_10));
        (uint24 fee, uint8 mode) = hook.quoteFee();
        assertEq(fee, FEE_MIN);
        assertEq(mode, hook.MODE_NORMAL());
    }

    function test_DegradedRaisesToTheSafeFee() public {
        _deliver(desk, _report(T0, SIGMA_100, 26, 4, 10_000));
        (uint24 fee, uint8 mode) = hook.quoteFee();
        assertEq(fee, FEE_SAFE);
        assertEq(mode, hook.MODE_DEGRADED());
    }

    function test_BlindStartsStrictlyAfterTauKill() public {
        _deliver(desk, _report(T0, SIGMA_100));
        vm.warp(T0 + TAU_KILL);
        (uint24 fee, uint8 mode) = hook.quoteFee();
        assertEq(fee, 1095);
        assertEq(mode, hook.MODE_NORMAL());

        vm.warp(T0 + TAU_KILL + 1);
        (fee, mode) = hook.quoteFee();
        assertEq(fee, FEE_SAFE);
        assertEq(mode, hook.MODE_BLIND());
    }

    function test_BlindKeepsAStormFeeAboveTheSafeFee() public {
        _deliver(desk, _report(T0, SIGMA_300));
        uint24 storm = _expected(SIGMA_300, 10_000);
        assertEq(storm, 3284);
        vm.warp(T0 + TAU_KILL + 1);
        (uint24 fee, uint8 mode) = hook.quoteFee();
        assertEq(fee, storm);
        assertEq(mode, hook.MODE_BLIND());
    }

    function test_RecoversWhenTheDeskResumes() public {
        _deliver(desk, _report(T0, SIGMA_100));
        vm.warp(T0 + 600);
        (, uint8 mode) = hook.quoteFee();
        assertEq(mode, hook.MODE_BLIND());
        _deliver(desk, _report(T0 + 600, SIGMA_100));
        (uint24 fee, uint8 mode2) = hook.quoteFee();
        assertEq(fee, 1095);
        assertEq(mode2, hook.MODE_NORMAL());
    }

    function test_CappedAtTheMaxFee() public {
        _deliver(desk, _report(T0, 1_780_730, 3, 4, 20_000));
        (uint24 fee,) = hook.quoteFee();
        assertEq(fee, FEE_MAX);
    }

    // ---------------------------------------------------------------- swaps pay exactly quoteFee

    function test_SwapPaysExactlyQuoteFee_BothDirections() public {
        _deliver(desk, _report(T0, SIGMA_100));
        (uint24 quoted,) = hook.quoteFee();
        assertEq(_swapFee(key, true, -1e18), quoted);
        assertEq(_swapFee(key, false, -1e18), quoted);
        assertEq(_swapFee(key, true, 1e17), quoted); // exact output
    }

    function test_SwapPaysTheSafeFeeWhenBlind() public {
        assertEq(_swapFee(key, true, -1e18), FEE_SAFE);
    }

    function test_SwapPaysTheSafeFeeWhenDegraded() public {
        _deliver(desk, _report(T0, SIGMA_100, 40, 4, 10_000));
        assertEq(_swapFee(key, false, -1e18), FEE_SAFE);
    }

    /// The fee depends only on the desk, never on pool state or trade size: splitting a trade cannot lower it.
    function test_SplittingASwapDoesNotChangeItsFee() public {
        _deliver(desk, _report(T0, SIGMA_100));
        uint24 whole = _swapFee(key, true, -10e18);
        for (uint256 i; i < 10; i++) {
            assertEq(_swapFee(key, true, -1e18), whole);
        }
        assertEq(_swapFee(key, false, -25e18), whole); // price moved a lot, fee did not
    }

    function testFuzz_SwapFeeEqualsQuoteFee(uint32 sigmaE9, uint16 kE4, uint16 dispBp, uint32 elapsed, bool zeroForOne)
        public
    {
        sigmaE9 = uint32(bound(sigmaE9, 0, 2_000_000));
        elapsed = uint32(bound(elapsed, 0, 1_000));
        _deliver(desk, _report(T0, sigmaE9, dispBp, 4, kE4));
        vm.warp(T0 + elapsed);

        (uint24 quoted, uint8 mode) = hook.quoteFee();
        assertEq(_swapFee(key, zeroForOne, -1e17), quoted);
        assertGe(quoted, FEE_MIN);
        assertLe(quoted, FEE_MAX);
        if (mode != hook.MODE_NORMAL()) assertGe(quoted, FEE_SAFE);
    }
}
