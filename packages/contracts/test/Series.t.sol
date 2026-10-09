// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeriesToken} from "../src/SeriesToken.sol";
import {Base} from "./Base.t.sol";
import {Series} from "../src/Series.sol";
import {AssetAttestation} from "../src/AssetAttestation.sol";
import {IAssetAttestation} from "../src/interfaces/IAssetAttestation.sol";

contract SeriesTest is Base {
    // ------------------------------------------------------------ pembukaan
    function test_cannot_open_without_attestation() public {
        vm.prank(operator);
        vm.expectRevert(Series.NoValidAttestation.selector);
        series.openOffering();
    }

    function test_cannot_open_when_price_above_attested_max() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 10_000); // maxPrice < UNIT
        bytes[] memory s = _sign(a, 2);
        att.submit(a, s);
        vm.prank(operator);
        vm.expectRevert(Series.PriceAboveMax.selector);
        series.openOffering();
    }

    function test_cannot_open_with_fail_verdict() public {
        AssetAttestation.Attestation memory a = _att(2, 2, 20_000);
        bytes[] memory s = _sign(a, 1);
        att.submit(a, s);
        vm.prank(operator);
        vm.expectRevert(Series.NoValidAttestation.selector);
        series.openOffering();
    }

    function test_only_operator_opens() public {
        _attestPass();
        vm.expectRevert();
        series.openOffering();
    }

    function test_bad_terms_rejected() public {
        vm.expectRevert(Series.BadTerms.selector);
        new Series(admin, operator, sa[2], IAssetAttestation(address(att)), "x", "X", Series.Terms(100, 200, 10, 1000, 365, 1 days));
    }

    // ------------------------------------------------------------ pembelian
    function test_purchase_before_open_reverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Series.WrongState.selector, Series.State.Draft));
        series.recordPurchase(alice, 1, bytes32(uint256(1)), false);
    }

    function test_no_mint_after_attestation_revoked() public {
        _open();
        vm.prank(sa[0]);
        att.revoke(address(series), keccak256("fraud"));
        vm.prank(operator);
        vm.expectRevert(Series.NoValidAttestation.selector);
        series.recordPurchase(alice, 1, bytes32(uint256(1)), false);
    }

    function test_cap_enforced() public {
        _open();
        _buy(alice, 10_000, bytes32(uint256(1)), false);
        vm.prank(operator);
        vm.expectRevert(Series.CapExceeded.selector);
        series.recordPurchase(bob, 1, bytes32(uint256(2)), false);
    }

    function test_payment_ref_cannot_be_reused() public {
        _open();
        _buy(alice, 1, bytes32(uint256(1)), false);
        vm.prank(operator);
        vm.expectRevert(Series.PaymentRefReused.selector);
        series.recordPurchase(bob, 1, bytes32(uint256(1)), false);
    }

    function test_purchase_after_offering_end_reverts() public {
        _open();
        vm.warp(block.timestamp + 8 days);
        vm.prank(operator);
        vm.expectRevert(Series.OfferingEnded.selector);
        series.recordPurchase(alice, 1, bytes32(uint256(1)), false);
    }

    function test_close_too_early_reverts() public {
        _open();
        _buy(alice, 10, bytes32(uint256(1)), false);
        vm.expectRevert(Series.OfferingNotEnded.selector);
        series.closeOffering();
    }

    function test_close_early_when_sold_out() public {
        _open();
        _buy(alice, 10_000, bytes32(uint256(1)), false);
        series.closeOffering();
        assertEq(uint8(series.state()), uint8(Series.State.Funded));
    }

    // ------------------------------------------------------------ Cara 1: minimum raise
    function test_funded_when_min_raise_reached_and_supply_locked() public {
        _fund();
        assertEq(uint8(series.state()), uint8(Series.State.Funded));
        assertEq(series.raised(), 105_000_000);
        assertEq(series.S(), 7000);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Series.WrongState.selector, Series.State.Funded));
        series.recordPurchase(carol, 1, bytes32(uint256(3)), false); // suplai terkunci
    }

    function test_failed_below_min_raise_and_full_refund() public {
        _open();
        _buy(alice, 3000, bytes32(uint256(1)), false); // 45jt
        _buy(bob, 1000, bytes32(uint256(2)), false); // 15jt
        vm.warp(block.timestamp + 8 days);
        series.closeOffering();
        assertEq(uint8(series.state()), uint8(Series.State.Failed));
        assertEq(att.totalShareBps(ASSET), 0); // kuota persen dibebaskan

        series.refund(alice);
        series.refund(bob);
        assertEq(token.totalSupply(), 0);
        assertEq(series.refunded(), series.raised());

        vm.expectRevert(Series.NothingToRefund.selector);
        series.refund(alice);
    }

    function test_related_party_purchase_not_counted_to_min_raise() public {
        _open();
        _buy(alice, 4000, bytes32(uint256(1)), false); // 60jt
        _buy(ownerBuyer, 3000, bytes32(uint256(2)), true); // 45jt, pihak terkait
        assertEq(series.raised(), 105_000_000);
        assertEq(series.countedRaise(), 60_000_000);
        vm.warp(block.timestamp + 8 days);
        series.closeOffering();
        assertEq(uint8(series.state()), uint8(Series.State.Failed)); // 60jt < 100jt
    }

    function test_anyone_can_fail_offering_if_attestation_revoked() public {
        _open();
        _buy(alice, 100, bytes32(uint256(1)), false);
        vm.prank(sa[1]);
        att.revoke(address(series), keccak256("fraud"));
        series.closeOffering();
        assertEq(uint8(series.state()), uint8(Series.State.Failed));
    }

    function test_refund_not_available_when_funded() public {
        _fund();
        vm.expectRevert(abi.encodeWithSelector(Series.WrongState.selector, Series.State.Funded));
        series.refund(alice);
    }

    // ------------------------------------------------------------ rilis bertahap
    function test_tranche1_is_half_and_needs_valid_attestation() public {
        _fund();
        vm.prank(sa[0]);
        att.revoke(address(series), keccak256("x"));
        vm.prank(operator);
        vm.expectRevert(Series.NoValidAttestation.selector);
        series.releaseTranche1();
    }

    function test_tranche1_amount() public {
        _active();
        assertEq(series.released(), 52_500_000);
        assertTrue(series.tranche1Released());
        assertEq(uint8(series.state()), uint8(Series.State.Active));
    }

    function test_tranche1_requires_funded() public {
        _open();
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Series.WrongState.selector, Series.State.Offering));
        series.releaseTranche1();
    }

    function test_tranche2_requires_clean_first_period() public {
        _active();
        vm.startPrank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        vm.expectRevert(Series.PeriodNotClean.selector);
        series.releaseTranche2();
        series.reconcilePeriod(1, true, keccak256("recon1"));
        series.releaseTranche2();
        vm.stopPrank();
        assertEq(series.released(), 105_000_000); // seluruh dana
        assertLe(series.released(), series.raised());
    }

    function test_tranche2_held_by_open_exception() public {
        _active();
        vm.startPrank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        series.reconcilePeriod(1, true, keccak256("recon1"));
        vm.stopPrank();
        vm.prank(sa[2]); // auditor
        series.setException(true);
        vm.prank(operator);
        vm.expectRevert(Series.ExceptionIsOpen.selector);
        series.releaseTranche2();
        vm.prank(sa[2]);
        series.setException(false);
        vm.prank(operator);
        series.releaseTranche2();
    }

    function test_tranche2_blocked_after_attestation_revoked() public {
        _active();
        vm.startPrank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        series.reconcilePeriod(1, true, keccak256("recon1"));
        vm.stopPrank();
        vm.prank(sa[0]);
        att.revoke(address(series), keccak256("fraud: booking fiktif"));
        vm.prank(operator);
        vm.expectRevert(Series.NoValidAttestation.selector);
        series.releaseTranche2();
    }

    function test_tranche2_cannot_release_twice() public {
        _active();
        vm.startPrank(operator);
        series.postPool(1, 1, keccak256("p1"));
        series.reconcilePeriod(1, true, keccak256("r"));
        series.releaseTranche2();
        vm.expectRevert(Series.AlreadyReleased.selector);
        series.releaseTranche2();
        vm.stopPrank();
    }

    function test_only_auditor_sets_exception() public {
        vm.expectRevert(Series.NotAuditor.selector);
        series.setException(true);
    }

    // ------------------------------------------------------------ kantong & redeem
    function test_pool_posting_sequence_and_redeem_value() public {
        _active();
        assertEq(series.redeemValuePerToken(), 0); // mulai ~0
        vm.startPrank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        vm.expectRevert(Series.BadPeriod.selector);
        series.postPool(3, 1, bytes32(0)); // harus berurutan
        vm.expectRevert(Series.BadPeriod.selector);
        series.postPool(1, 1, bytes32(0)); // tidak boleh diulang
        vm.stopPrank();
        assertEq(series.P(), 1_000_000);
        assertEq(series.redeemValuePerToken(), 142); // 1.000.000 / 7000 dibulatkan ke bawah
    }

    function test_redeem_full_flow_partial_and_rounding() public {
        _active();
        vm.prank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));

        vm.prank(alice);
        uint256 id = series.requestRedeem(5000);
        assertEq(series.pendingUnits(alice), 5000);

        vm.prank(operator);
        series.approveRedeem(id);
        assertEq(series.R(), 714_285); // floor(5000 * 1.000.000 / 7000)
        assertEq(series.S(), 2000);

        vm.prank(operator);
        series.confirmRedeem(id);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.totalSupply(), 2000);
        assertEq(series.pendingUnits(alice), 0);
        assertLe(series.R(), series.P());

        // bob menebus separuh: nilai per token naik karena sisa kantong dibagi suplai tersisa
        uint256 q = series.quoteRedeem(1000);
        assertEq(q, 142_857); // floor(1000 * 285.715 / 2000)
    }

    function test_redeem_zero_payout_rejected() public {
        _active();
        vm.prank(alice);
        uint256 id = series.requestRedeem(10);
        vm.prank(operator);
        vm.expectRevert(Series.ZeroPayout.selector); // P = 0: tebus awal tidak dapat apa-apa
        series.approveRedeem(id);
    }

    function test_cannot_redeem_more_than_balance_including_locked() public {
        _active();
        vm.startPrank(alice);
        series.requestRedeem(4000);
        vm.expectRevert(Series.InsufficientBalance.selector);
        series.requestRedeem(1001);
        series.requestRedeem(1000);
        vm.stopPrank();
    }

    function test_redeem_fifo() public {
        _active();
        vm.prank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        vm.prank(alice);
        uint256 a = series.requestRedeem(100);
        vm.prank(bob);
        uint256 b = series.requestRedeem(100);
        vm.prank(operator);
        vm.expectRevert(Series.NotHead.selector);
        series.approveRedeem(b);
        vm.startPrank(operator);
        series.approveRedeem(a);
        series.approveRedeem(b);
        vm.stopPrank();
    }

    function test_cancel_pending_skipped_by_queue() public {
        _active();
        vm.prank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        vm.prank(alice);
        uint256 a = series.requestRedeem(100);
        vm.prank(bob);
        uint256 b = series.requestRedeem(100);
        vm.prank(alice);
        series.cancelRedeem(a);
        assertEq(series.pendingUnits(alice), 0);
        vm.prank(operator);
        series.approveRedeem(b);
    }

    function test_failed_payout_unlocks_and_restores_pool_numbers() public {
        _active();
        vm.prank(operator);
        series.postPool(1, 1_000_000, keccak256("p1"));
        vm.prank(alice);
        uint256 id = series.requestRedeem(5000);
        vm.startPrank(operator);
        series.approveRedeem(id);
        series.failRedeem(id);
        vm.stopPrank();
        assertEq(series.R(), 0);
        assertEq(series.S(), 7000);
        assertEq(series.pendingUnits(alice), 0);
        assertEq(token.balanceOf(alice), 5000);
    }

    function test_gasless_redeem_with_holder_signature() public {
        uint256 pk = 0xA11CE;
        address holder = vm.addr(pk);
        _open();
        vm.prank(operator);
        series.setKyc(holder, true);
        _buy(holder, 4000, bytes32(uint256(1)), false);
        _buy(bob, 3000, bytes32(uint256(2)), false);
        vm.warp(block.timestamp + 8 days);
        series.closeOffering();
        vm.prank(operator);
        series.releaseTranche1();

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 typehash = keccak256("RedeemRequest(address series,address holder,uint256 units,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typehash, address(series), holder, uint256(500), uint256(0), deadline));
        (, string memory name, string memory version, uint256 chainId, address vc,,) = series.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                vc
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(operator);
        uint256 id = series.requestRedeemFor(holder, 500, deadline, sig);
        assertEq(series.pendingUnits(holder), 500);
        assertEq(id, 1);

        // replay ditolak (nonce naik)
        vm.prank(operator);
        vm.expectRevert(Series.BadSignature.selector);
        series.requestRedeemFor(holder, 500, deadline, sig);
    }

    function test_all_redeemed_closes_series_and_blocks_split() public {
        _active();
        vm.prank(operator);
        series.postPool(1, 7_000_000, keccak256("p1"));
        vm.prank(alice);
        uint256 a = series.requestRedeem(5000);
        vm.prank(bob);
        uint256 b = series.requestRedeem(2000);
        vm.startPrank(operator);
        series.approveRedeem(a);
        series.approveRedeem(b);
        series.confirmRedeem(a);
        assertEq(uint8(series.state()), uint8(Series.State.Active));
        series.confirmRedeem(b);
        vm.stopPrank();
        assertEq(uint8(series.state()), uint8(Series.State.Closed));
        assertEq(token.totalSupply(), 0);
        assertEq(series.R(), 7_000_000); // tebus semua = seluruh kantong, tanpa sisa
        assertEq(att.totalShareBps(ASSET), 0);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Series.WrongState.selector, Series.State.Closed));
        series.postPool(2, 1, bytes32(0)); // seri Closed tidak bisa menerima split
        assertEq(series.redeemValuePerToken(), 0); // tidak ada bagi nol
    }

    function test_tenor_end_closes_and_remaining_pool_shared_by_remaining_tokens() public {
        _active();
        vm.prank(operator);
        series.postPool(1, 7_000_000, keccak256("p1"));
        vm.expectRevert(Series.TenorNotEnded.selector);
        series.endTenor();
        vm.warp(block.timestamp + 366 days);
        series.endTenor();
        assertEq(uint8(series.state()), uint8(Series.State.Closed));

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Series.WrongState.selector, Series.State.Closed));
        series.postPool(2, 1, bytes32(0));

        // tebus setelah Closed tetap mungkin selama masih ada suplai
        vm.prank(alice);
        uint256 id = series.requestRedeem(5000);
        vm.prank(operator);
        series.approveRedeem(id);
        assertEq(series.R(), 5_000_000);
    }

    function test_post_pool_after_tenor_reverts() public {
        _active();
        vm.warp(block.timestamp + 366 days);
        vm.prank(operator);
        vm.expectRevert(Series.TenorEnded.selector);
        series.postPool(1, 1, bytes32(0));
    }

    // ------------------------------------------------------------ anchor root harian
    function _rootSig(uint256 pk, uint32 day, bytes32 root, uint32 count) internal view returns (bytes memory) {
        bytes32 typehash = keccak256("DailyRoot(address series,uint32 day,bytes32 root,uint32 count)");
        bytes32 structHash = keccak256(abi.encode(typehash, address(series), day, root, count));
        (, string memory name, string memory version, uint256 chainId, address vc,,) = series.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                vc
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function test_anchor_root_requires_auditor_signature_and_is_write_once() public {
        _open();
        bytes32 root = keccak256("root-2026-10-08");
        bytes memory good = _rootSig(keys[2], 20261008, root, 42);
        bytes memory bad = _rootSig(keys[0], 20261008, root, 42);

        vm.startPrank(operator);
        vm.expectRevert(Series.BadSignature.selector);
        series.anchorRoot(20261008, root, 42, bad);
        series.anchorRoot(20261008, root, 42, good);
        vm.expectRevert(Series.RootAlreadyAnchored.selector);
        series.anchorRoot(20261008, root, 42, good);
        vm.stopPrank();
        assertEq(series.dailyRoot(20261008), root);
    }

    function test_anchor_root_signature_binds_payload() public {
        _open();
        bytes memory sig = _rootSig(keys[2], 20261008, keccak256("a"), 1);
        vm.prank(operator);
        vm.expectRevert(Series.BadSignature.selector);
        series.anchorRoot(20261008, keccak256("TAMPERED"), 1, sig);
    }

    // ------------------------------------------------------------ pause
    function test_pause_blocks_purchase_but_not_refund_or_redeem_request() public {
        _active();
        vm.prank(admin);
        series.pause();
        vm.prank(alice);
        series.requestRedeem(1); // jalur keluar tetap terbuka
    }

    // ---------------------------------------------------------------- transfer antar pemegang ber-KYC
    function _signTransfer(uint256 pk, address from, address to, uint256 units, uint256 nonce, uint256 deadline) internal view returns (bytes memory) {
        bytes32 typehash = keccak256("TransferRequest(address series,address from,address to,uint256 units,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typehash, address(series), from, to, units, nonce, deadline));
        (, string memory name, string memory version, uint256 chainId, address vc,,) = series.eip712Domain();
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes(name)), keccak256(bytes(version)), chainId, vc));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function test_transfer_between_kyc_holders_keeps_pool_accounting() public {
        (address holder, uint256 pk) = _activeWithSender();
        uint256 supplyBefore = token.totalSupply();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signTransfer(pk, holder, carol, 400, 0, deadline);
        vm.prank(operator);
        series.transferFor(holder, carol, 400, deadline, sig);
        assertEq(token.balanceOf(holder), 600);
        assertEq(token.balanceOf(carol), 400);
        assertEq(token.totalSupply(), supplyBefore);
        assertEq(series.S(), supplyBefore);
        // replay ditolak
        vm.prank(operator);
        vm.expectRevert(Series.BadSignature.selector);
        series.transferFor(holder, carol, 400, deadline, sig);
    }

    function test_transfer_rejects_non_kyc_recipient_locked_units_wrong_signer_and_wrong_state() public {
        (address holder, uint256 pk) = _activeWithSender();
        uint256 deadline = block.timestamp + 1 hours;
        address stranger = makeAddr("stranger");

        bytes memory s0 = _signTransfer(pk, holder, stranger, 10, 0, deadline);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(SeriesToken.NotAllowlisted.selector, stranger));
        series.transferFor(holder, stranger, 10, deadline, s0);

        // token terkunci untuk redeem tidak bisa dikirim
        vm.prank(holder);
        series.requestRedeem(900);
        bytes memory s1 = _signTransfer(pk, holder, carol, 200, 0, deadline);
        vm.prank(operator);
        vm.expectRevert(Series.InsufficientBalance.selector);
        series.transferFor(holder, carol, 200, deadline, s1);

        // penandatangan salah
        (, uint256 otherPk) = makeAddrAndKey("other");
        bytes memory s2 = _signTransfer(otherPk, holder, carol, 50, 0, deadline);
        vm.prank(operator);
        vm.expectRevert(Series.BadSignature.selector);
        series.transferFor(holder, carol, 50, deadline, s2);

        // kedaluwarsa
        bytes memory s3 = _signTransfer(pk, holder, carol, 50, 0, block.timestamp - 1);
        vm.prank(operator);
        vm.expectRevert(Series.SignatureExpired.selector);
        series.transferFor(holder, carol, 50, block.timestamp - 1, s3);

        // hanya operator
        vm.prank(alice);
        vm.expectRevert();
        series.transferFor(holder, carol, 50, deadline, s3);
    }

    function test_transfer_closed_during_offering() public {
        _open();
        _buy(alice, 100, bytes32(uint256(1)), false);
        vm.prank(operator);
        vm.expectRevert(Series.TransferNotOpen.selector);
        series.transferFor(alice, bob, 1, block.timestamp + 1, "");
    }

    function test_direct_erc20_transfer_still_locked_after_funding() public {
        _active();
        vm.prank(alice);
        vm.expectRevert(SeriesToken.TransfersLocked.selector);
        token.transfer(bob, 1);
        vm.prank(alice);
        vm.expectRevert(SeriesToken.OnlySeries.selector);
        token.move(alice, bob, 1);
    }

    function test_receiver_can_redeem_transferred_tokens() public {
        (address holder, uint256 pk) = _activeWithSender();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signTransfer(pk, holder, carol, 100, 0, deadline);
        vm.prank(operator);
        series.transferFor(holder, carol, 100, deadline, sig);
        vm.prank(carol);
        series.requestRedeem(100);
        assertEq(series.pendingUnits(carol), 100);
    }

    /// Seri Active dengan satu pemegang ber-kunci (sender) yang membeli 1000 token saat penawaran.
    function _activeWithSender() internal returns (address holder, uint256 pk) {
        (holder, pk) = makeAddrAndKey("sender");
        vm.prank(operator);
        series.setKyc(holder, true);
        _open();
        _buy(alice, 5000, bytes32(uint256(1)), false);
        _buy(bob, 2000, bytes32(uint256(2)), false);
        _buy(holder, 1000, bytes32(uint256(3)), false);
        vm.warp(block.timestamp + 8 days);
        series.closeOffering();
        vm.prank(operator);
        series.releaseTranche1();
    }
}
