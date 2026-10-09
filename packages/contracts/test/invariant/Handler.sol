// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {AssetAttestation} from "../../src/AssetAttestation.sol";
import {Series} from "../../src/Series.sol";
import {SeriesToken} from "../../src/SeriesToken.sol";

/// Handler: memanggil seluruh siklus hidup seri secara acak dan mencatat "ghost" untuk invarian lintas-panggilan.
contract Handler is CommonBase, StdCheats, StdUtils {
    Series public series;
    AssetAttestation public att;
    SeriesToken public token;
    address public operator;
    address public auditor;
    address public signer0;
    address[] public actors;

    // ghost variables
    uint256 public ghostMintWhileInvalid; // mint sukses saat attestation tidak valid
    uint256 public ghostReleaseIllegal; // rilis sukses di luar syarat
    uint256 public ghostSplitAfterClosed; // postPool sukses saat Closed
    uint256 public ghostApprovedUnits; // token yang redeem-nya sudah disetujui tapi belum dibakar
    uint256 public ghostRefundUnits;
    uint256 public ghostPurchasePaymentRefs;
    uint256 public ghostPayoutAboveFloor; // payout melebihi floor(k x (P-R) / S)
    uint256 public nFunded;
    uint256 public nFailed;
    uint256 public nApprove;
    uint256 public nConfirm;
    uint256 public nClosed;
    uint256 public nPost;
    mapping(uint256 => bool) public isApproved;

    uint64 internal nextPeriod = 1;

    constructor(Series s, AssetAttestation a, address op, address aud, address sig0, address[] memory actors_) {
        series = s;
        att = a;
        token = s.token();
        operator = op;
        auditor = aud;
        signer0 = sig0;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function buy(uint256 actorSeed, uint256 units, uint256 relatedSeed) external {
        bool related = relatedSeed % 5 == 0;
        units = bound(units, 1500, 4000);
        bool valid = att.isValid(address(series));
        vm.prank(operator);
        try series.recordPurchase(_actor(actorSeed), units, bytes32(++ghostPurchasePaymentRefs), related) {
            if (!valid) ghostMintWhileInvalid++;
        } catch {}
    }

    function close(uint256 seed) external {
        // utamakan penutupan setelah minRaise tercapai agar state Funded/Active/Closed sering dicapai;
        // sesekali tutup lebih awal untuk menjangkau jalur Failed.
        if (series.state() == Series.State.Offering && series.countedRaise() < series.minRaise() && seed % 64 != 0) return;
        vm.warp(block.timestamp + 8 days);
        try series.closeOffering() {
            if (series.state() == Series.State.Funded) nFunded++;
            else nFailed++;
        } catch {}
    }

    function advance(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 1 days));
    }

    /// lompat ke akhir tenor (jarang) agar jalur endTenor / redeem setelah Closed terjangkau
    function warpToTenorEnd(uint256 seed) external {
        if (seed % 4 != 0 || series.tenorEnd() == 0) return;
        vm.warp(series.tenorEnd() + 1);
    }

    function tranche1() external {
        Series.State st = series.state();
        bool valid = att.isValid(address(series));
        vm.prank(operator);
        try series.releaseTranche1() {
            if (st != Series.State.Funded || !valid) ghostReleaseIllegal++;
        } catch {}
    }

    function tranche2() external {
        bool valid = att.isValid(address(series));
        bool clean = series.periodClean(1);
        bool exc = series.exceptionOpen();
        bool t1 = series.tranche1Released();
        vm.prank(operator);
        try series.releaseTranche2() {
            if (!valid || !clean || exc || !t1) ghostReleaseIllegal++;
        } catch {}
    }

    function post(uint256 amount) external {
        amount = bound(amount, 1_000_000, 5_000_000);
        Series.State st = series.state();
        uint64 period = series.lastPeriod() + 1; // hitung sebelum prank (view call akan memakan prank)
        vm.prank(operator);
        try series.postPool(period, amount, bytes32(amount)) {
            nPost++;
            if (st == Series.State.Closed) ghostSplitAfterClosed++;
        } catch {}
    }

    function reconcile(uint256 seed) external {
        if (series.lastPeriod() == 0) return;
        vm.prank(operator);
        try series.reconcilePeriod(1, seed % 4 != 0, bytes32(0)) {} catch {}
    }

    function setException(uint256 seed) external {
        vm.prank(auditor);
        series.setException(seed % 5 == 0);
    }

    function revoke(uint256 seed) external {
        if (seed % 40 != 0) return;
        vm.prank(signer0);
        try att.revoke(address(series), keccak256("fraud")) {} catch {}
    }

    function refund(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        uint256 bal = token.balanceOf(a);
        try series.refund(a) {
            ghostRefundUnits += bal;
        } catch {}
    }

    function requestRedeem(uint256 actorSeed, uint256 units) external {
        address a = _actor(actorSeed);
        uint256 free = token.balanceOf(a) - series.pendingUnits(a);
        if (free == 0) return;
        units = bound(units, 1, free);
        vm.prank(a);
        try series.requestRedeem(units) {} catch {}
    }

    function approveHead() external {
        uint256 n = series.nextRedeemId();
        for (uint256 id = 1; id <= n; id++) {
            (address holder, uint128 units,, Series.RedeemStatus st) = series.redeems(id);
            holder;
            if (st == Series.RedeemStatus.Pending) {
                uint256 rBefore = series.R();
                uint256 floorPayout = series.S() == 0 ? 0 : (uint256(units) * (series.P() - rBefore)) / series.S();
                vm.prank(operator);
                try series.approveRedeem(id) {
                    if (series.R() - rBefore > floorPayout) ghostPayoutAboveFloor++;
                    isApproved[id] = true;
                    ghostApprovedUnits += units;
                    nApprove++;
                } catch {}
                return;
            }
        }
    }

    function confirm(uint256 seed) external {
        uint256 n = series.nextRedeemId();
        if (n == 0) return;
        uint256 id = (seed % n) + 1;
        if (!isApproved[id]) return;
        (, uint128 units,,) = series.redeems(id);
        vm.prank(operator);
        try series.confirmRedeem(id) {
            isApproved[id] = false;
            ghostApprovedUnits -= units;
            nConfirm++;
            if (series.state() == Series.State.Closed) nClosed++;
        } catch {}
    }

    function failPayout(uint256 seed) external {
        uint256 n = series.nextRedeemId();
        if (n == 0) return;
        uint256 id = (seed % n) + 1;
        if (!isApproved[id]) return;
        (, uint128 units,,) = series.redeems(id);
        vm.prank(operator);
        try series.failRedeem(id) {
            isApproved[id] = false;
            ghostApprovedUnits -= units;
        } catch {}
    }

    function cancel(uint256 seed) external {
        uint256 n = series.nextRedeemId();
        if (n == 0) return;
        uint256 id = (seed % n) + 1;
        vm.prank(operator);
        try series.cancelRedeem(id) {} catch {}
    }

    function endTenor() external {
        try series.endTenor() {
            nClosed++;
        } catch {}
    }

    /// Langkah terpandu: maju sesuai state siklus hidup (tetap acak) supaya jalur dalam
    /// (Funded -> Active -> redeem -> Closed) sering terjangkau oleh fuzzer.
    function progress(uint256 seed) external {
        Series.State st = series.state();
        if (st == Series.State.Offering) {
            if (series.countedRaise() < series.minRaise()) this.buy(seed, 4000, 1);
            else this.close(seed);
        } else if (st == Series.State.Funded) {
            if (seed % 2 == 0) this.tranche1();
            else this.post(seed);
        } else if (st == Series.State.Active || st == Series.State.Closed) {
            uint256 k = seed % 7;
            if (k == 0) this.post(seed);
            else if (k == 1 || k == 2) this.requestRedeem(seed, seed / 7);
            else if (k == 3) this.approveHead();
            else if (k == 4) this.confirm(seed / 7);
            else if (k == 5) this.reconcile(seed);
            else this.tranche2();
        }
    }
}
