// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "../Base.t.sol";
import {console} from "forge-std/console.sol";
import {Handler} from "./Handler.sol";
import {Series} from "../../src/Series.sol";
import {AssetAttestation} from "../../src/AssetAttestation.sol";

contract SeriesInvariantTest is Base {
    Handler internal h;

    function setUp() public override {
        super.setUp();
        _open(); // attestation valid + Offering; handler boleh merevoke
        address[] memory actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        actors[3] = ownerBuyer;
        h = new Handler(series, att, operator, sa[2], sa[0], actors);
        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](20);
        sel[0] = Handler.buy.selector;
        sel[1] = Handler.close.selector;
        sel[2] = Handler.advance.selector;
        sel[3] = Handler.tranche1.selector;
        sel[4] = Handler.tranche2.selector;
        sel[5] = Handler.post.selector;
        sel[6] = Handler.reconcile.selector;
        sel[7] = Handler.setException.selector;
        sel[8] = Handler.revoke.selector;
        sel[9] = Handler.refund.selector;
        sel[10] = Handler.requestRedeem.selector;
        sel[11] = Handler.approveHead.selector;
        sel[12] = Handler.confirm.selector;
        sel[13] = Handler.failPayout.selector;
        sel[14] = Handler.cancel.selector;
        sel[15] = Handler.warpToTenorEnd.selector;
        sel[16] = Handler.endTenor.selector;
        sel[17] = Handler.progress.selector;
        sel[18] = Handler.progress.selector;
        sel[19] = Handler.progress.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    function afterInvariant() public view {
        console.log("funded/failed/post", h.nFunded(), h.nFailed(), h.nPost());
        console.log("approve/confirm/closed", h.nApprove(), h.nConfirm(), h.nClosed());
    }

    /// redeemed <= pool
    function invariant_redeemedNeverExceedsPool() public view {
        assertLe(series.R(), series.P());
        assertLe(series.paidOut(), series.R());
    }

    /// pembulatan selalu ke bawah untuk investor
    function invariant_payoutRoundsDown() public view {
        assertEq(h.ghostPayoutAboveFloor(), 0);
    }

    /// suplai <= cap
    function invariant_supplyNeverExceedsCap() public view {
        assertLe(token.totalSupply(), series.cap());
        assertLe(series.minted(), series.cap());
    }

    /// tidak ada mint tanpa attestation valid
    function invariant_noMintWithoutValidAttestation() public view {
        assertEq(h.ghostMintWhileInvalid(), 0);
    }

    /// tidak ada rilis tanpa syarat
    function invariant_noUnconditionalRelease() public view {
        assertEq(h.ghostReleaseIllegal(), 0);
        assertLe(series.released(), series.raised());
        assertLe(series.refunded(), series.raised());
    }

    /// seri Closed tidak bisa menerima split
    function invariant_closedSeriesRejectsSplit() public view {
        assertEq(h.ghostSplitAfterClosed(), 0);
    }

    /// akuntansi konsisten: suplai token = S + token yang redeem-nya sudah disetujui tapi belum dibakar
    function invariant_supplyAccounting() public view {
        if (series.state() == Series.State.Funded || series.state() == Series.State.Active || series.state() == Series.State.Closed) {
            if (series.tranche1Released() || series.state() == Series.State.Funded || series.S() > 0 || token.totalSupply() > 0) {
                assertEq(token.totalSupply(), series.S() + h.ghostApprovedUnits());
            }
        }
    }

    /// refund hanya dari token yang ada: total refund = unit dibakar x harga
    function invariant_refundAccounting() public view {
        assertEq(series.refunded(), h.ghostRefundUnits() * series.unitPrice());
    }

    /// kuota persen lintas seri tidak melebihi batas attestation
    function invariant_shareCap() public view {
        assertLe(att.totalShareBps(ASSET), 2000);
    }
}
