// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClimFeeMath} from "../src/libraries/ClimFeeMath.sol";

contract ClimFeeMathTest is Test {
    uint32 internal constant SQRT_HALF_DT_12S = 2_449_490; // sqrt(12 s / 2) * 1e6
    uint32 internal constant ETA_P10 = 91_761; // P* = 10 %: 1/0.10 - 0.8239168 = 9.1761
    uint32 internal constant ETA_P30 = 25_093; // P* = 30 %: round(1e4 * (1/0.30 - 0.824)) = 25_093 (spec 2.3)
    uint16 internal constant K1 = 10_000;
    uint24 internal constant MIN = 500; // 5 bp
    uint24 internal constant MAX = 15_000; // 150 bp

    function _fee(uint32 sigmaE9, uint32 etaE4, uint16 kE4) internal pure returns (uint24) {
        return ClimFeeMath.feePips(sigmaE9, etaE4, SQRT_HALF_DT_12S, kE4, 0, 1_000_000);
    }

    /// Unit checks from the design note (P* = 10 %), with ceil rounding.
    function test_UnitChecks_PStar10() public pure {
        // 48 %/yr -> sigmaE9 85_475: 1921.20 -> ceil 1922 pips (19.2 bp)
        assertEq(_fee(85_475, ETA_P10, K1), 1922);
        // 25 %/yr -> sigmaE9 44_518: 1000.62 -> ceil 1001 pips (10.0 bp)
        assertEq(_fee(44_518, ETA_P10, K1), 1001);
    }

    /// Post-audit calibration P* = 30 %: 5 bp up to ~46 %, 11 bp at 100 %, 25 bp at 225 %.
    function test_UnitChecks_PStar30() public pure {
        assertEq(ClimFeeMath.feePips(48_080, ETA_P30, SQRT_HALF_DT_12S, K1, MIN, MAX), 500); // 27 %: raw 296 -> floor 500
        assertEq(_fee(81_913, ETA_P30, K1), 504); // 46 %
        assertEq(_fee(178_072, ETA_P30, K1), 1095); // 100 %
        assertEq(_fee(400_663, ETA_P30, K1), 2463); // 225 %
    }

    /// Same vectors as shared/src/units.ts (plan 04), which mirrors this library off-chain.
    function test_SharedVectorsWithTheOffchainMirror() public pure {
        assertEq(_fee(178_072, 41_760, K1), 1822); // 100 %/yr, P* = 20 %
        assertEq(_fee(178_072, 25_093, K1), 1095); // 100 %/yr, P* = 30 %
        assertEq(_fee(400_663, 41_760, K1), 4099); // 225 %/yr, P* = 20 %
        assertEq(_fee(400_663, 25_093, K1), 2463); // 225 %/yr, P* = 30 %
        assertEq(_fee(1_780_730, 41_760, K1), 18_216); // SIGMA_MAX, P* = 20 %: raw, before the cap
        assertEq(ClimFeeMath.feePips(1_780_730, 41_760, SQRT_HALF_DT_12S, K1, MIN, MAX), MAX);
        assertEq(_fee(178_072, 25_093, 20_000), 2190); // k = 2
    }

    function test_KDoublesTheFee() public pure {
        // 3842.40 -> ceil 3843
        assertEq(_fee(85_475, ETA_P10, 20_000), 3843);
    }

    function test_CeilOnlyWhenThereIsARemainder() public pure {
        // 1_000 * 10_000 * 1_000_000 * 10_000 = 1e17 exactly -> 1 pip
        assertEq(ClimFeeMath.feePips(1_000, 10_000, 1_000_000, 10_000, 0, 1_000_000), 1);
        // 1.001e17 -> ceil 2 pips
        assertEq(ClimFeeMath.feePips(1_001, 10_000, 1_000_000, 10_000, 0, 1_000_000), 2);
    }

    function test_ClampsToFloorAndCap() public pure {
        assertEq(ClimFeeMath.feePips(0, ETA_P30, SQRT_HALF_DT_12S, K1, MIN, MAX), MIN);
        assertEq(ClimFeeMath.feePips(1_780_730, ETA_P10, SQRT_HALF_DT_12S, 20_000, MIN, MAX), MAX);
    }

    function test_NoOverflowAtTypeMaxima() public pure {
        uint24 fee =
            ClimFeeMath.feePips(type(uint32).max, type(uint32).max, type(uint32).max, type(uint16).max, MIN, MAX);
        assertEq(fee, MAX);
    }

    function testFuzz_WithinBounds(uint32 sigmaE9, uint32 etaE4, uint32 sqrtHalfDtE6, uint16 kE4) public pure {
        uint24 fee = ClimFeeMath.feePips(sigmaE9, etaE4, sqrtHalfDtE6, kE4, MIN, MAX);
        assertGe(fee, MIN);
        assertLe(fee, MAX);
    }

    function testFuzz_MonotoneInSigma(uint32 a, uint32 b, uint16 kE4) public pure {
        vm.assume(a <= b);
        assertLe(
            ClimFeeMath.feePips(a, ETA_P30, SQRT_HALF_DT_12S, kE4, MIN, MAX),
            ClimFeeMath.feePips(b, ETA_P30, SQRT_HALF_DT_12S, kE4, MIN, MAX)
        );
    }

    function testFuzz_MonotoneInK(uint32 sigmaE9, uint16 ka, uint16 kb) public pure {
        vm.assume(ka <= kb);
        assertLe(
            ClimFeeMath.feePips(sigmaE9, ETA_P30, SQRT_HALF_DT_12S, ka, MIN, MAX),
            ClimFeeMath.feePips(sigmaE9, ETA_P30, SQRT_HALF_DT_12S, kb, MIN, MAX)
        );
    }

    /// Matches the exact rational formula: fee * 1e17 >= product > (fee - 1) * 1e17 when not clamped.
    function testFuzz_IsCeilOfProduct(uint32 sigmaE9, uint16 kE4) public pure {
        sigmaE9 = uint32(bound(sigmaE9, 0, 1_780_730)); // RiskDesk.SIGMA_MAX_E9
        kE4 = uint16(bound(kE4, 0, 20_000)); // RiskDesk.K_MAX_E4
        uint256 num = uint256(sigmaE9) * ETA_P30 * SQRT_HALF_DT_12S * kE4;
        uint24 fee = ClimFeeMath.feePips(sigmaE9, ETA_P30, SQRT_HALF_DT_12S, kE4, 0, type(uint24).max);
        assertGe(uint256(fee) * 1e17, num);
        if (fee > 0) assertLt((uint256(fee) - 1) * 1e17, num);
    }
}
