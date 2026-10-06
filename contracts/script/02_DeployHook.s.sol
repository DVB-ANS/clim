// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {ClimScript} from "./base/ClimScript.sol";
import {ClimHook} from "../src/ClimHook.sol";

/// @notice Mines a CREATE2 salt for the afterInitialize|beforeSwap flags and deploys the suite's ClimHook
///         through the deterministic deployment proxy, with the immutable parameters decided by the lab.
///         On Sepolia it refuses params.json files whose decidedBy starts with PROVISIONAL or FIXTURE.
/// Env: SUITE (live | replay), PARAMS_PATH.
contract DeployHook is ClimScript {
    function run() external {
        _requirePoolSuite();
        _requireDecidedParams();
        uint256 pk = _pk();
        address desk = _readAddress(_suitePath("desk"), ".riskDesk");
        bytes memory args = _args(_hookParams(), desk);

        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG);
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(ClimHook).creationCode, args);
        uint256 deployBlock = block.number;

        vm.startBroadcast(pk);
        (bool ok,) = CREATE2_FACTORY.call(abi.encodePacked(salt, type(ClimHook).creationCode, args));
        vm.stopBroadcast();
        require(ok && predicted.code.length > 0, "DeployHook: CREATE2 deployment failed");
        require(address(ClimHook(predicted).desk()) == desk, "DeployHook: wrong desk");

        string memory o = "hook";
        vm.serializeAddress(o, "hook", predicted);
        vm.serializeBytes32(o, "salt", salt);
        string memory json = vm.serializeUint(o, "deployBlock", deployBlock);
        _write(_suitePath("hook"), json);
    }

    /// @dev Constructor args in ClimHook order: (poolManager, desk, etaE4, sqrtHalfDtE6, feeMin, feeMax, feeSafe, tauKill).
    function _args(HookParams memory p, address desk) internal pure returns (bytes memory) {
        return abi.encode(
            POOL_MANAGER, desk, p.etaE4, p.sqrtHalfDtE6, p.feeMinPips, p.feeMaxPips, p.feeSafePips, p.tauKillSec
        );
    }
}
