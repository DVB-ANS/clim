// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReceiverTemplate} from "./receiver/ReceiverTemplate.sol";
import {IRiskDesk, FLAG_DEGRADED, FLAG_REPLAY} from "./interfaces/IRiskDesk.sol";

/// @title RiskDesk
/// @notice Stores the volatility published by the clim CRE workflow ("risk desk").
///         The owner can only rotate the forwarder / workflow id (ReceiverTemplate) and switch off
///         simulation mode for good. The owner has no direct power over the volatility or the fee: it only
///         chooses which forwarder and workflow to trust (spec 6.7), and every report stays inside the envelope.
contract RiskDesk is ReceiverTemplate, IRiskDesk {
    /// @notice ABI layout of the CRE report: abi.encode(uint40,uint32,uint32,uint16,int24,uint16,uint8,uint16,uint8).
    struct Report {
        uint40 tObs;
        uint32 sigmaE9;
        uint32 rv15E9;
        uint16 dvolE2;
        int24 refTick;
        uint16 dispBp;
        uint8 nSources;
        uint16 kE4;
        uint8 zone;
    }

    struct State {
        uint40 tObs;
        uint32 sigmaE9;
        uint16 kE4;
        uint8 flags;
        uint32 seq;
    }

    uint32 public constant SIGMA_MIN_E9 = 17_807; // 10 %/yr
    uint32 public constant SIGMA_MAX_E9 = 1_780_730; // 1000 %/yr
    uint16 public constant K_MIN_E4 = 10_000;
    uint16 public constant K_MAX_E4 = 20_000;
    uint16 public constant DISP_MAX_BP = 25;
    uint40 public constant MIN_GAP = 20;
    uint40 public constant MAX_SKEW = 30;
    uint8 public constant MIN_SOURCES = 3;

    /// @notice EOA allowed to originate reports while simulation mode is on (the `cre workflow simulate --broadcast` key).
    address public immutable simOperator;
    /// @notice True until disableSim() is called. MockKeystoneForwarder checks no signature, so tx.origin is the guard.
    bool public simMode;

    State private s_state;

    event SimDisabled();

    error ZeroSimOperator();
    error NotSimOperator(address origin);
    error StaleReport(uint40 tObs, uint40 lastTObs);
    error FutureReport(uint40 tObs, uint256 blockTimestamp);
    error TooFewSources(uint8 nSources);

    constructor(address forwarder, address simOperator_, bool replay) ReceiverTemplate(forwarder) {
        if (simOperator_ == address(0)) revert ZeroSimOperator();
        simOperator = simOperator_;
        simMode = true;
        if (replay) s_state.flags = FLAG_REPLAY;
    }

    /// @inheritdoc IRiskDesk
    function state() external view returns (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq) {
        State memory s = s_state;
        return (s.tObs, s.sigmaE9, s.kE4, s.flags, s.seq);
    }

    /// @notice Irreversibly stops accepting reports on the sole basis of tx.origin (switch to the production forwarder first).
    function disableSim() external onlyOwner {
        simMode = false;
        emit SimDisabled();
    }

    function _processReport(bytes calldata report) internal override {
        Report memory r = abi.decode(report, (Report));
        State memory s = s_state;

        // solhint-disable-next-line avoid-tx-origin
        if (simMode && tx.origin != simOperator) revert NotSimOperator(tx.origin);
        if (s.seq != 0 && r.tObs < s.tObs + MIN_GAP) revert StaleReport(r.tObs, s.tObs);
        if (r.tObs > block.timestamp + MAX_SKEW) revert FutureReport(r.tObs, block.timestamp);
        if (r.nSources < MIN_SOURCES) revert TooFewSources(r.nSources);

        uint32 applied = _envelope(r.sigmaE9, s.sigmaE9, s.seq == 0);
        r.kE4 = r.kE4 < K_MIN_E4 ? K_MIN_E4 : (r.kE4 > K_MAX_E4 ? K_MAX_E4 : r.kE4);
        uint8 flags = (s.flags & FLAG_REPLAY) | (r.dispBp > DISP_MAX_BP ? FLAG_DEGRADED : 0);
        uint32 seq = s.seq + 1;

        s_state = State({tObs: r.tObs, sigmaE9: applied, kE4: r.kE4, flags: flags, seq: seq});
        _emitReported(seq, applied, r);
    }

    /// @dev Separate frame to keep the 11-field event under the stack limit without via-IR. `r.kE4` is already clamped.
    function _emitReported(uint32 seq, uint32 applied, Report memory r) private {
        emit RiskReported(
            seq, r.tObs, applied, r.sigmaE9, r.rv15E9, r.dvolE2, r.refTick, r.dispBp, r.nSources, r.kE4, r.zone
        );
    }

    /// @dev Volatility rises fast (x2 per report) and decays slowly (x0.8 per report); first report only gets the absolute bounds.
    function _envelope(uint32 reported, uint32 prev, bool first) internal pure returns (uint32) {
        uint256 lo = SIGMA_MIN_E9;
        uint256 hi = SIGMA_MAX_E9;
        if (!first) {
            uint256 down = (uint256(prev) * 8) / 10;
            uint256 up = uint256(prev) * 2;
            if (down > lo) lo = down;
            if (up < hi) hi = up;
        }
        if (reported < lo) return uint32(lo);
        if (reported > hi) return uint32(hi);
        return reported;
    }
}
