// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {RiskDesk} from "../../src/RiskDesk.sol";

/// @notice Shared fixtures for tests that feed reports to a RiskDesk the way MockKeystoneForwarder does.
abstract contract DeskHelpers is Test {
    uint40 internal constant T0 = 1_760_000_000;

    // Volatility per sqrt-second times 1e9 (annual / sqrt(31_536_000)).
    uint32 internal constant SIGMA_10 = 17_807; // 10 %/yr
    uint32 internal constant SIGMA_48 = 85_475; // 48 %/yr
    uint32 internal constant SIGMA_100 = 178_072; // 100 %/yr
    uint32 internal constant SIGMA_300 = 534_217; // 300 %/yr

    address internal forwarder = makeAddr("forwarder");
    address internal operator = makeAddr("simOperator");
    address internal attacker = makeAddr("attacker");

    /// @dev Report with sensible defaults for the fields the contracts do not act on.
    function _report(uint40 tObs, uint32 sigmaE9, uint16 dispBp, uint8 nSources, uint16 kE4)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(tObs, sigmaE9, sigmaE9, uint16(4_800), int24(82_944), dispBp, nSources, kE4, uint8(0));
    }

    /// @dev Calm, healthy report: 4 venues, 3 bp dispersion, k = 1.
    function _report(uint40 tObs, uint32 sigmaE9) internal pure returns (bytes memory) {
        return _report(tObs, sigmaE9, 3, 4, 10_000);
    }

    /// @dev Delivers a report as the forwarder, inside a transaction signed by `origin`.
    function _deliver(RiskDesk desk, bytes memory report, address origin) internal {
        vm.prank(forwarder, origin);
        desk.onReport("", report);
    }

    function _deliver(RiskDesk desk, bytes memory report) internal {
        _deliver(desk, report, operator);
    }
}
