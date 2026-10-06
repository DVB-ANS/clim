// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RiskDesk} from "../src/RiskDesk.sol";
import {IRiskDesk, FLAG_DEGRADED, FLAG_REPLAY} from "../src/interfaces/IRiskDesk.sol";
import {ReceiverTemplate} from "../src/receiver/ReceiverTemplate.sol";
import {IReceiver} from "../src/receiver/IReceiver.sol";
import {IERC165} from "../src/receiver/IERC165.sol";
import {DeskHelpers} from "./utils/DeskHelpers.sol";

contract RiskDeskTest is DeskHelpers {
    RiskDesk internal desk;

    function setUp() public {
        vm.warp(T0);
        desk = new RiskDesk(forwarder, operator, false);
    }

    function _state() internal view returns (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq) {
        return desk.state();
    }

    // ---------------------------------------------------------------- construction

    function test_Constructor() public view {
        assertEq(desk.owner(), address(this));
        assertEq(desk.getForwarderAddress(), forwarder);
        assertEq(desk.simOperator(), operator);
        assertTrue(desk.simMode());
        (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq) = _state();
        assertEq(tObs, 0);
        assertEq(sigmaE9, 0);
        assertEq(kE4, 0);
        assertEq(flags, 0);
        assertEq(seq, 0);
    }

    function test_ReplayDeskStartsWithReplayFlag() public {
        RiskDesk replay = new RiskDesk(forwarder, operator, true);
        (,,, uint8 flags,) = replay.state();
        assertEq(flags, FLAG_REPLAY);
    }

    function test_RevertWhen_ZeroSimOperator() public {
        vm.expectRevert(RiskDesk.ZeroSimOperator.selector);
        new RiskDesk(forwarder, address(0), false);
    }

    function test_RevertWhen_ZeroForwarder() public {
        vm.expectRevert(ReceiverTemplate.InvalidForwarderAddress.selector);
        new RiskDesk(address(0), operator, false);
    }

    function test_SupportsIReceiverViaERC165() public view {
        assertTrue(desk.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(desk.supportsInterface(type(IERC165).interfaceId));
    }

    // ---------------------------------------------------------------- acceptance

    function test_FirstReport_StoresStateAndEmits() public {
        bytes memory report = abi.encode(
            T0, SIGMA_48, uint32(90_000), uint16(4_812), int24(82_944), uint16(3), uint8(4), uint16(10_000), uint8(0)
        );
        vm.expectEmit(true, false, false, true, address(desk));
        emit IRiskDesk.RiskReported(1, T0, SIGMA_48, SIGMA_48, 90_000, 4_812, 82_944, 3, 4, 10_000, 0);
        _deliver(desk, report);

        (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq) = _state();
        assertEq(tObs, T0);
        assertEq(sigmaE9, SIGMA_48);
        assertEq(kE4, 10_000);
        assertEq(flags, 0);
        assertEq(seq, 1);
    }

    function test_SeqIncrementsPerAcceptedReport() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, SIGMA_48));
        (,,,, uint32 seq) = _state();
        assertEq(seq, 2);
    }

    // ---------------------------------------------------------------- envelope

    function test_FirstReport_ClampedToAbsoluteFloor() public {
        _deliver(desk, _report(T0, 0));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, desk.SIGMA_MIN_E9());
    }

    function test_FirstReport_ClampedToAbsoluteCap() public {
        _deliver(desk, _report(T0, 5_000_000));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, desk.SIGMA_MAX_E9());
    }

    function test_Envelope_RiseCappedAtTwiceThePrevious() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, 1_000_000));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, 170_950); // 2 * 85_475
    }

    function test_Envelope_FallCappedAtEightyPercentOfThePrevious() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, 20_000));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, 68_380); // 85_475 * 8 / 10
    }

    function test_Envelope_NeverBelowSigmaMin() public {
        _deliver(desk, _report(T0, 20_000));
        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, 0));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, 17_807); // max(17_807, 16_000)
    }

    function test_Envelope_NeverAboveSigmaMax() public {
        _deliver(desk, _report(T0, 1_500_000));
        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, 3_000_000));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, 1_780_730); // min(1_780_730, 3_000_000)
    }

    function test_Envelope_PassesThroughInsideTheBand() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, 100_000));
        (, uint32 sigmaE9,,,) = _state();
        assertEq(sigmaE9, 100_000);
    }

    function testFuzz_EnvelopeBounds(uint32 first, uint32 second) public {
        _deliver(desk, _report(T0, first));
        (, uint32 prev,,,) = _state();
        assertGe(prev, desk.SIGMA_MIN_E9());
        assertLe(prev, desk.SIGMA_MAX_E9());

        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, second));
        (, uint32 applied,,,) = _state();
        uint256 lo = uint256(prev) * 8 / 10;
        if (lo < desk.SIGMA_MIN_E9()) lo = desk.SIGMA_MIN_E9();
        uint256 hi = uint256(prev) * 2;
        if (hi > desk.SIGMA_MAX_E9()) hi = desk.SIGMA_MAX_E9();
        assertGe(applied, lo);
        assertLe(applied, hi);
        if (second >= lo && second <= hi) assertEq(applied, second);
    }

    // ---------------------------------------------------------------- k and flags

    function test_KClampedToOneAndTwo() public {
        _deliver(desk, _report(T0, SIGMA_48, 3, 4, 0));
        (,, uint16 kE4,,) = _state();
        assertEq(kE4, 10_000);

        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, SIGMA_48, 3, 4, 50_000));
        (,, kE4,,) = _state();
        assertEq(kE4, 20_000);

        vm.warp(T0 + 60);
        _deliver(desk, _report(T0 + 60, SIGMA_48, 3, 4, 15_000));
        (,, kE4,,) = _state();
        assertEq(kE4, 15_000);
    }

    function test_DegradedFlagFollowsDispersion() public {
        _deliver(desk, _report(T0, SIGMA_48, 25, 4, 10_000)); // 25 bp: not degraded
        (,,, uint8 flags,) = _state();
        assertEq(flags, 0);

        vm.warp(T0 + 30);
        _deliver(desk, _report(T0 + 30, SIGMA_48, 26, 4, 10_000)); // 26 bp: degraded
        (,,, flags,) = _state();
        assertEq(flags, FLAG_DEGRADED);

        vm.warp(T0 + 60);
        _deliver(desk, _report(T0 + 60, SIGMA_48, 3, 4, 10_000)); // back to normal
        (,,, flags,) = _state();
        assertEq(flags, 0);
    }

    function test_ReplayFlagSurvivesEveryReport() public {
        RiskDesk replay = new RiskDesk(forwarder, operator, true);
        _deliver(replay, _report(T0, SIGMA_48, 40, 4, 10_000));
        (,,, uint8 flags,) = replay.state();
        assertEq(flags, FLAG_REPLAY | FLAG_DEGRADED);

        vm.warp(T0 + 30);
        _deliver(replay, _report(T0 + 30, SIGMA_48, 3, 4, 10_000));
        (,,, flags,) = replay.state();
        assertEq(flags, FLAG_REPLAY);
    }

    // ---------------------------------------------------------------- rejections

    function test_RevertWhen_CallerIsNotTheForwarder() public {
        vm.prank(attacker, operator);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, attacker, forwarder));
        desk.onReport("", _report(T0, SIGMA_48));
    }

    function test_RevertWhen_SimModeAndOriginIsNotTheOperator() public {
        vm.prank(forwarder, attacker);
        vm.expectRevert(abi.encodeWithSelector(RiskDesk.NotSimOperator.selector, attacker));
        desk.onReport("", _report(T0, 0));
    }

    function test_AnyOriginAcceptedAfterDisableSim() public {
        desk.disableSim();
        assertFalse(desk.simMode());
        _deliver(desk, _report(T0, SIGMA_48), attacker);
        (,,,, uint32 seq) = _state();
        assertEq(seq, 1);
    }

    function test_RevertWhen_DisableSimByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        desk.disableSim();
    }

    function test_RevertWhen_GapUnderTwentySeconds() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.warp(T0 + 19);
        vm.prank(forwarder, operator);
        vm.expectRevert(abi.encodeWithSelector(RiskDesk.StaleReport.selector, T0 + 19, T0));
        desk.onReport("", _report(T0 + 19, SIGMA_48));
    }

    function test_AcceptsAtExactlyTwentySeconds() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.warp(T0 + 20);
        _deliver(desk, _report(T0 + 20, SIGMA_48));
        (uint40 tObs,,,,) = _state();
        assertEq(tObs, T0 + 20);
    }

    function test_RevertWhen_ReplayingAnOlderReport() public {
        _deliver(desk, _report(T0, SIGMA_48));
        vm.prank(forwarder, operator);
        vm.expectRevert(abi.encodeWithSelector(RiskDesk.StaleReport.selector, T0 - 60, T0));
        desk.onReport("", _report(T0 - 60, SIGMA_48));
    }

    function test_RevertWhen_MoreThanThirtySecondsInTheFuture() public {
        vm.prank(forwarder, operator);
        vm.expectRevert(abi.encodeWithSelector(RiskDesk.FutureReport.selector, T0 + 31, uint256(T0)));
        desk.onReport("", _report(T0 + 31, SIGMA_48));
    }

    function test_AcceptsThirtySecondsInTheFuture() public {
        _deliver(desk, _report(T0 + 30, SIGMA_48));
        (uint40 tObs,,,,) = _state();
        assertEq(tObs, T0 + 30);
    }

    function test_RevertWhen_FewerThanThreeSources() public {
        vm.prank(forwarder, operator);
        vm.expectRevert(abi.encodeWithSelector(RiskDesk.TooFewSources.selector, uint8(2)));
        desk.onReport("", _report(T0, SIGMA_48, 3, 2, 10_000));
    }

    function test_RevertWhen_ReportIsTruncated() public {
        vm.prank(forwarder, operator);
        vm.expectRevert();
        desk.onReport("", abi.encode(T0, SIGMA_48));
    }

    // ---------------------------------------------------------------- admin

    function test_OwnerCanRotateTheForwarder() public {
        address prod = makeAddr("keystoneForwarder");
        desk.setForwarderAddress(prod);
        assertEq(desk.getForwarderAddress(), prod);

        vm.prank(forwarder, operator);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, forwarder, prod));
        desk.onReport("", _report(T0, SIGMA_48));
    }
}
