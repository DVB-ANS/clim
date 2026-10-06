// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {ReceiverTemplate as SportsReceiverTemplate} from "./fixtures/sports-resolution/ReceiverTemplate.sol";
import {IReceiver} from "./fixtures/sports-resolution/IReceiver.sol";

/// @dev Friction log row 23 / DevEx report ask 2. The fixture is the sports-resolution `ReceiverTemplate.sol`,
///      unmodified, from smartcontractkit/cre-templates at d0223f31182c76bc36b1cc9d47b13b18efcf2bf6
///      (starter-templates/sports-resolution/sports-resolution-ts/contracts/evm/src, MIT, see fixtures/sports-resolution/LICENSE).
///      It requires `metadata.length == 62`; the forwarders pass 64 bytes.
contract SportsConsumer is SportsReceiverTemplate {
    uint256 public reports;

    constructor(address forwarder) SportsReceiverTemplate(forwarder) {}

    function _processReport(bytes calldata) internal override {
        reports++;
    }
}

/// @dev Same call as `KeystoneForwarder.report` and `MockKeystoneForwarder.report` (chainlink-evm b6427ea,
///      contracts/cre/src/v1/KeystoneForwarder.sol and contracts/cre/src/dev/MockKeystoneForwarder.sol):
///      `onReport(rawReport[45:109], rawReport[109:])`. Unlike the forwarders, it lets the revert bubble up
///      so the test can read the reason.
contract ForwarderSlice {
    uint256 internal constant FORWARDER_METADATA_LENGTH = 45;
    uint256 internal constant METADATA_LENGTH = 109;

    function deliver(address receiver, bytes calldata rawReport) external {
        IReceiver(receiver).onReport(rawReport[FORWARDER_METADATA_LENGTH:METADATA_LENGTH], rawReport[METADATA_LENGTH:]);
    }
}

interface IMockKeystoneForwarder {
    function report(address receiver, bytes calldata rawReport, bytes calldata reportContext, bytes[] calldata sigs)
        external;
}

contract ReceiverTemplateMetadataTest is Test {
    address internal constant MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    bytes32 internal constant REPORT_PROCESSED = keccak256("ReportProcessed(address,bytes32,bytes2,bool)");

    bytes32 internal constant WORKFLOW_ID = bytes32(uint256(0xc1137));
    bytes10 internal constant WORKFLOW_NAME = bytes10("clim-desk0");
    address internal constant WORKFLOW_OWNER = address(0xA11CE);
    bytes2 internal constant REPORT_ID = bytes2(0x0001);

    ForwarderSlice internal forwarder;
    SportsConsumer internal consumer;
    bytes internal report = abi.encode(uint256(42));

    function setUp() public {
        forwarder = new ForwarderSlice();
        consumer = new SportsConsumer(address(forwarder));
    }

    /// @dev Raw report layout of `KeystoneForwarder._getMetadata`: version 1, execution id 32, timestamp 4,
    ///      DON id 4, DON config version 4 (45 bytes), then workflow id 32, name 10, owner 20, report id 2 (64 bytes).
    function _raw() internal view returns (bytes memory) {
        return abi.encodePacked(
            uint8(1),
            bytes32(uint256(7)),
            uint32(block.timestamp),
            uint32(1),
            uint32(1),
            WORKFLOW_ID,
            WORKFLOW_NAME,
            WORKFLOW_OWNER,
            REPORT_ID,
            report
        );
    }

    function _forwarderMetadata() internal pure returns (bytes memory) {
        return abi.encodePacked(WORKFLOW_ID, WORKFLOW_NAME, WORKFLOW_OWNER, REPORT_ID);
    }

    function test_ForwarderPasses64BytesOfMetadata() public {
        assertEq(_forwarderMetadata().length, 64);
        vm.expectCall(address(consumer), abi.encodeCall(IReceiver.onReport, (_forwarderMetadata(), report)));
        forwarder.deliver(address(consumer), _raw());
        assertEq(consumer.reports(), 1);
    }

    function test_WorkflowIdCheck_RevertsOnForwarderMetadata() public {
        consumer.setExpectedWorkflowId(WORKFLOW_ID);
        vm.expectRevert(abi.encodeWithSelector(SportsReceiverTemplate.InvalidMetadataLength.selector, 64, 62));
        forwarder.deliver(address(consumer), _raw());
    }

    function test_AuthorCheck_RevertsOnForwarderMetadata() public {
        consumer.setExpectedAuthor(WORKFLOW_OWNER);
        vm.expectRevert(abi.encodeWithSelector(SportsReceiverTemplate.InvalidMetadataLength.selector, 64, 62));
        forwarder.deliver(address(consumer), _raw());
    }

    /// @dev Control: the same identity without the 2-byte report id passes, so only the length check fails.
    function test_Same62Bytes_Accepted() public {
        consumer.setExpectedWorkflowId(WORKFLOW_ID);
        consumer.setExpectedAuthor(WORKFLOW_OWNER);
        vm.prank(address(forwarder));
        consumer.onReport(abi.encodePacked(WORKFLOW_ID, WORKFLOW_NAME, WORKFLOW_OWNER), report);
        assertEq(consumer.reports(), 1);
    }

    /// @dev Against the deployed MockKeystoneForwarder on Sepolia (the one `cre workflow simulate --broadcast` calls).
    ///      Skipped without SEPOLIA_RPC_URL. With the workflow id check on, the mock passes 64 bytes, the consumer
    ///      reverts, and the mock swallows it: status 1, `ReportProcessed` false (friction log rows 9 and 23).
    function test_Fork_MockForwarder_WorkflowIdCheck_ReportRejected() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        vm.createSelectFork(rpc);
        SportsConsumer sim = new SportsConsumer(MOCK_FORWARDER);

        assertTrue(_viaMock(sim, bytes32(uint256(1))));
        assertEq(sim.reports(), 1);

        sim.setExpectedWorkflowId(WORKFLOW_ID);
        vm.expectCall(address(sim), abi.encodeCall(IReceiver.onReport, (_forwarderMetadata(), report)));
        assertFalse(_viaMock(sim, bytes32(uint256(2))));
        assertEq(sim.reports(), 1);
    }

    function _viaMock(SportsConsumer sim, bytes32 executionId) internal returns (bool result) {
        bytes memory raw = _raw();
        assembly {
            mstore(add(raw, 33), executionId) // execution id at byte 1 of the raw report
        }
        vm.recordLogs();
        IMockKeystoneForwarder(MOCK_FORWARDER).report(address(sim), raw, "", new bytes[](0));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == MOCK_FORWARDER && logs[i].topics[0] == REPORT_PROCESSED) {
                return abi.decode(logs[i].data, (bool));
            }
        }
        revert("no ReportProcessed");
    }
}
