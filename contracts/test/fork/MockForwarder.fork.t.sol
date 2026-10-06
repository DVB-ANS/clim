// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {RiskDesk} from "../../src/RiskDesk.sol";
import {DeskHelpers} from "../utils/DeskHelpers.sol";

interface IMockKeystoneForwarder {
    function report(
        address receiver,
        bytes calldata rawReport,
        bytes calldata reportContext,
        bytes[] calldata signatures
    ) external;
}

/// @notice Runs against the real MockKeystoneForwarder on Sepolia (the one `cre workflow simulate --broadcast` calls).
///         Proves: (1) the mock calls onReport with msg.sender = mock and tx.origin = the EOA that sent the tx,
///         (2) a rejected report does NOT revert the transaction: the mock swallows it and emits ReportProcessed(false).
contract MockForwarderForkTest is DeskHelpers {
    address internal constant MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    bytes32 internal constant REPORT_PROCESSED = keccak256("ReportProcessed(address,bytes32,bytes2,bool)");

    RiskDesk internal desk;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        vm.createSelectFork(rpc);
        desk = new RiskDesk(MOCK_FORWARDER, operator, false);
    }

    /// @dev Forwarder raw report: 109 bytes of metadata, then the workflow's report.
    function _raw(bytes memory report, bytes32 executionId) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(1),
            executionId,
            uint32(0),
            uint32(0),
            uint32(0),
            bytes32(0),
            bytes10(0),
            address(0),
            bytes2(0),
            report
        );
    }

    function _send(address origin, bytes memory report, bytes32 executionId) internal returns (bool result) {
        vm.recordLogs();
        vm.prank(origin, origin);
        IMockKeystoneForwarder(MOCK_FORWARDER).report(address(desk), _raw(report, executionId), "", new bytes[](0));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == MOCK_FORWARDER && logs[i].topics[0] == REPORT_PROCESSED) {
                return abi.decode(logs[i].data, (bool));
            }
        }
        revert("no ReportProcessed");
    }

    function test_OperatorReportIsDelivered() public {
        uint40 t = uint40(block.timestamp);
        assertTrue(_send(operator, _report(t, SIGMA_48), bytes32(uint256(1))));
        (uint40 tObs, uint32 sigmaE9,,, uint32 seq) = desk.state();
        assertEq(tObs, t);
        assertEq(sigmaE9, SIGMA_48);
        assertEq(seq, 1);
    }

    function test_ThirdPartyReportIsSwallowedNotReverted() public {
        uint40 t = uint40(block.timestamp);
        assertFalse(_send(attacker, _report(t, 0), bytes32(uint256(2))));
        (,,,, uint32 seq) = desk.state();
        assertEq(seq, 0);
    }
}
