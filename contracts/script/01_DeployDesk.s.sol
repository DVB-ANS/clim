// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ClimScript} from "./base/ClimScript.sol";
import {RiskDesk} from "../src/RiskDesk.sol";

/// @notice Deploys the RiskDesk of a suite. simOperator = the key `cre workflow simulate --broadcast` uses: the deployer,
///         or SIM_OPERATOR (Task 18 gives the replay desk its own operator key, so the two CRE loops never share a nonce).
///         SUITE=don deploys the desk for a real DON deployment: production KeystoneForwarder, simulation mode off.
/// Env: SUITE (live | replay | don), FORWARDER (default: MockKeystoneForwarder, KeystoneForwarder for don),
///      SIM_OPERATOR (default: the deployer).
contract DeployDesk is ClimScript {
    function run() external {
        uint256 pk = _pk();
        address deployer = vm.addr(pk);
        address simOp = vm.envOr("SIM_OPERATOR", deployer);
        bool don = _isDon();
        address forwarder = vm.envOr("FORWARDER", don ? KEYSTONE_FORWARDER : MOCK_FORWARDER);
        uint256 deployBlock = block.number;

        vm.startBroadcast(pk);
        RiskDesk desk = new RiskDesk(forwarder, simOp, _isReplay());
        if (don) desk.disableSim();
        vm.stopBroadcast();

        string memory o = "desk";
        vm.serializeAddress(o, "riskDesk", address(desk));
        vm.serializeAddress(o, "forwarder", forwarder);
        vm.serializeAddress(o, "simOperator", simOp);
        vm.serializeBool(o, "simMode", desk.simMode());
        string memory json = vm.serializeUint(o, "deployBlock", deployBlock);
        _write(_suitePath("desk"), json);
    }
}
