// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

/// @notice Shared plumbing for the clim deploy scripts.
///         Each step writes a JSON fragment to deployments/<chainId>/; 05_WriteDeployments merges them into shared/.
///         Env: PRIVATE_KEY (deployer = simOperator), SUITE = live | replay | don (default live),
///         PARAMS_PATH (default ../shared/params.json).
abstract contract ClimScript is Script {
    // Sepolia infrastructure, verified on-chain in Task 1 of plan 01.
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant STATE_VIEW = 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C;
    address internal constant POOL_SWAP_TEST = 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe;
    address internal constant POOL_MODIFY_LIQUIDITY_TEST = 0x0C478023803a644c94c4CE1C1e7b9A087e411B0A;
    address internal constant MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address internal constant KEYSTONE_FORWARDER = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;
    uint256 internal constant SEPOLIA = 11155111;

    int24 internal constant TICK_SPACING = 60;

    struct HookParams {
        uint32 etaE4;
        uint32 sqrtHalfDtE6;
        uint24 feeMinPips;
        uint24 feeMaxPips;
        uint24 feeSafePips;
        uint32 tauKillSec;
    }

    function _pk() internal view returns (uint256) {
        return vm.envUint("PRIVATE_KEY");
    }

    function _suite() internal view returns (string memory suite) {
        suite = vm.envOr("SUITE", string("live"));
        bytes32 h = keccak256(bytes(suite));
        require(
            h == keccak256("live") || h == keccak256("replay") || h == keccak256("don"),
            "SUITE must be live, replay or don"
        );
    }

    function _isReplay() internal view returns (bool) {
        return keccak256(bytes(_suite())) == keccak256("replay");
    }

    function _isDon() internal view returns (bool) {
        return keccak256(bytes(_suite())) == keccak256("don");
    }

    /// @dev Hooks and pools exist only for the live and replay suites; the DON desk is a desk alone.
    function _requirePoolSuite() internal view {
        require(!_isDon(), "SUITE=don has no hook and no pools");
    }

    function _dir() internal view returns (string memory) {
        return string.concat("deployments/", vm.toString(block.chainid), "/");
    }

    function _path(string memory name) internal view returns (string memory) {
        return string.concat(_dir(), name, ".json");
    }

    /// @dev Suite-scoped fragment, e.g. deployments/11155111/desk-live.json.
    function _suitePath(string memory name) internal view returns (string memory) {
        return _path(string.concat(name, "-", _suite()));
    }

    function _write(string memory path, string memory json) internal {
        vm.createDir(_dir(), true);
        vm.writeJson(json, path);
    }

    function _readAddress(string memory path, string memory key) internal view returns (address) {
        return vm.parseJsonAddress(vm.readFile(path), key);
    }

    function _paramsJson() internal view returns (string memory) {
        return vm.readFile(vm.envOr("PARAMS_PATH", string("../shared/params.json")));
    }

    /// @dev The immutable ClimHook parameters, as decided by the lab (plan 03).
    function _hookParams() internal view returns (HookParams memory p) {
        string memory json = _paramsJson();
        p.etaE4 = uint32(_u(json, ".etaE4", type(uint32).max));
        p.sqrtHalfDtE6 = uint32(_u(json, ".sqrtHalfDtE6", type(uint32).max));
        p.feeMinPips = uint24(_u(json, ".feeMinPips", 1_000_000));
        p.feeMaxPips = uint24(_u(json, ".feeMaxPips", 1_000_000));
        p.feeSafePips = uint24(_u(json, ".feeSafePips", 1_000_000));
        p.tauKillSec = uint32(_u(json, ".tauKillSec", type(uint32).max));
    }

    /// @dev Static fee of pool S: the lab's estimate of V's time-average fee (staticFeePips / replayStaticFeePips).
    function _staticFee(bool replay) internal view returns (uint24) {
        string memory json = _paramsJson();
        string memory key = replay ? ".replayStaticFeePips" : ".staticFeePips";
        require(
            vm.keyExistsJson(json, key), string.concat("params.json has no ", key, ": the lab decision must add it")
        );
        return uint24(_u(json, key, 1_000_000));
    }

    /// @dev Refuses bootstrap or fixture parameters on Sepolia: hook parameters are immutable.
    function _requireDecidedParams() internal view {
        if (block.chainid != SEPOLIA) return;
        bytes memory by = bytes(vm.parseJsonString(_paramsJson(), ".decidedBy"));
        require(!_startsWith(by, "PROVISIONAL") && !_startsWith(by, "FIXTURE"), "params.json is not a lab decision");
    }

    function _startsWith(bytes memory s, bytes memory prefix) private pure returns (bool) {
        if (s.length < prefix.length) return false;
        for (uint256 i; i < prefix.length; i++) {
            if (s[i] != prefix[i]) return false;
        }
        return true;
    }

    function _u(string memory json, string memory key, uint256 max) private pure returns (uint256 v) {
        v = vm.parseJsonUint(json, key);
        require(v <= max, string.concat("params out of range: ", key));
    }
}
