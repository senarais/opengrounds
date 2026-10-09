// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {SeriesToken} from "../src/SeriesToken.sol";
import {VenueSeries} from "../src/VenueSeries.sol";

contract VenueSeriesTest is Base {
    address internal alice;
    address internal bob;

    function setUp() public override {
        super.setUp();
        alice = vm.addr(PK_ALICE);
        bob = vm.addr(PK_BOB);
    }

    // ================================================================== penerbitan (verifikasi aset 2-of-3)

    function test_activate_mintsSupplyOnceToTreasury() public {
        _activate();
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Active));
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(treasury), SUPPLY);
        assertEq(token.decimals(), 0);
    }

    function test_activate_platformAloneCannotIssue() public {
        vm.prank(admin);
        series.markVerified(bytes32(0));
        bytes32 ev = keccak256("acq");
        bytes32 payload = keccak256(abi.encode(VALUATION, SUPPLY, REF_PRICE, uint16(5000), uint16(200), ev));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign1(AttestationRegistry.Kind.ACQUISITION_CLOSED, 0, payload, dl, PK_PLATFORM);
        vm.expectRevert(AttestationRegistry.NotEnoughSignatures.selector);
        series.activate(VALUATION, SUPPLY, REF_PRICE, ev, dl, sigs);
    }

    function test_activate_requiresOwnerNotVerifier() public {
        vm.prank(admin);
        series.markVerified(bytes32(0));
        bytes32 ev = keccak256("acq");
        bytes32 payload = keccak256(abi.encode(VALUATION, SUPPLY, REF_PRICE, uint16(5000), uint16(200), ev));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.ACQUISITION_CLOSED, 0, payload, dl, PK_PLATFORM, PK_VERIFIER);
        uint8 slot = registry.SLOT_VERIFIER();
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.SlotNotAllowed.selector, slot));
        series.activate(VALUATION, SUPPLY, REF_PRICE, ev, dl, sigs);
    }

    function test_activate_priceMustMatchValuation() public {
        vm.prank(admin);
        series.markVerified(bytes32(0));
        vm.expectRevert(VenueSeries.BadPrice.selector);
        series.activate(VALUATION, SUPPLY, REF_PRICE + 1, bytes32(0), _deadline(), new bytes[](0));
    }

    function test_activate_onlyFromVerified() public {
        vm.expectRevert(abi.encodeWithSelector(VenueSeries.WrongState.selector, VenueSeries.State.Draft));
        series.activate(VALUATION, SUPPLY, REF_PRICE, bytes32(0), _deadline(), new bytes[](0));
    }

    // ================================================================== §6.8 "platform curang ditolak"

    /// @notice §6.8.1 Platform tidak bisa memberi token tanpa tanda tangan investor penerimanya.
    function test_cheat_allocateWithoutInvestorSignature() public {
        _activate();
        _verifyHolder(alice);
        VenueSeries.Order memory o = VenueSeries.Order(alice, 100, 100 * REF_PRICE, 1, _deadline());
        bytes memory forged = _sig(PK_PLATFORM, series.orderDigest(o)); // platform menandatangani atas nama alice
        vm.expectRevert(VenueSeries.BadInvestorSignature.selector);
        _exec(o, forged);
    }

    /// @notice §6.8.2 Alokasi dengan nominal rupiah yang tidak sesuai harga ditolak, juga bila investor sendiri menandatanganinya.
    function test_cheat_allocateWrongAmount() public {
        _activate();
        _verifyHolder(alice);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 100, 100 * REF_PRICE - 1);
        vm.expectRevert(VenueSeries.BadPrice.selector);
        _exec(o, sig);
    }

    /// @notice Platform tidak bisa mengubah isi pesanan setelah investor menandatanganinya.
    function test_cheat_tamperSignedOrder() public {
        _activate();
        _verifyHolder(alice);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 100, 100 * REF_PRICE);
        o.tokens = 10;
        o.paidIdr = 10 * REF_PRICE; // investor membayar untuk 100, platform hanya memberi 10
        vm.expectRevert(VenueSeries.BadInvestorSignature.selector);
        _exec(o, sig);
    }

    /// @notice §6.8.3 Transfer antar investor ditolak, saat dan setelah masa kunci.
    function test_cheat_investorToInvestorTransfer() public {
        _activate();
        _verifyHolder(alice);
        _verifyHolder(bob);
        _allocate(PK_ALICE, 100);
        vm.prank(alice);
        vm.expectRevert(SeriesToken.TransfersRestricted.selector);
        token.transfer(bob, 10);
        (bool ok, uint8 code) = token.canTransfer(alice, bob, 10);
        assertFalse(ok);
        assertEq(code, token.INVESTOR_TO_INVESTOR());
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vm.expectRevert(SeriesToken.TransfersRestricted.selector);
        token.transfer(bob, 10);
    }

    /// @notice §6.8.4 Posting periode dengan biaya melebihi plafon ditolak.
    function test_cheat_opexAboveCap() public {
        _activate();
        VenueSeries.Waterfall memory w = VenueSeries.Waterfall(52_000_000, 0, 41_700_000, 0, 0, 0, 0); // > 80% gross
        uint64 end = uint64(block.timestamp - 1);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.OpexAboveCap.selector);
        series.postRevenuePeriod(1, end, w, bytes32(0), _deadline(), new bytes[](0));
    }

    /// @notice §6.8.5 Mengubah pembagian setelah periode diposting ditolak.
    function test_cheat_repostPeriod() public {
        _activate();
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        w.opex = 10_000_000;
        uint64 end = uint64(block.timestamp - 1);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.BadPeriod.selector);
        series.postRevenuePeriod(1, end, w, bytes32(0), _deadline(), new bytes[](0));
    }

    /// @notice Platform sendirian tidak bisa menetapkan laba bulanan: butuh owner (atau verifier bila owner diam).
    function test_cheat_platformAloneCannotPostRevenue() public {
        _activate();
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        uint64 end = uint64(block.timestamp - 1);
        bytes32 payload = keccak256(abi.encode(uint256(1), end, w, bytes32(0)));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, 1, payload, dl, PK_PLATFORM, PK_PLATFORM);
        uint8 slot = registry.SLOT_PLATFORM();
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.DuplicateSlot.selector, slot));
        series.postRevenuePeriod(1, end, w, bytes32(0), dl, sigs);
    }

    function test_cheat_withoutPlatform() public {
        _activate();
        uint64 end = uint64(block.timestamp - 1);
        vm.warp(block.timestamp + 4 days);
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        bytes32 payload = keccak256(abi.encode(uint256(1), end, w, bytes32(0)));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, 1, payload, dl, PK_OWNER, PK_VERIFIER);
        vm.prank(controller);
        vm.expectRevert(AttestationRegistry.PlatformRequired.selector);
        series.postRevenuePeriod(1, end, w, bytes32(0), dl, sigs);
    }

    function test_cheat_strangerAttestor() public {
        _activate();
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        uint64 end = uint64(block.timestamp - 1);
        bytes32 payload = keccak256(abi.encode(uint256(1), end, w, bytes32(0)));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, 1, payload, dl, PK_PLATFORM, PK_STRANGER);
        vm.prank(controller);
        vm.expectRevert(AttestationRegistry.UnknownSigner.selector);
        series.postRevenuePeriod(1, end, w, bytes32(0), dl, sigs);
    }

    function test_cheat_expiredAttestation() public {
        _activate();
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        uint64 end = uint64(block.timestamp - 1);
        bytes32 payload = keccak256(abi.encode(uint256(1), end, w, bytes32(0)));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, 1, payload, dl, PK_PLATFORM, PK_OWNER);
        vm.warp(dl + 1);
        vm.prank(controller);
        vm.expectRevert(AttestationRegistry.Expired.selector);
        series.postRevenuePeriod(1, end, w, bytes32(0), dl, sigs);
    }

    // ================================================================== pesanan investor

    function test_order_replayRejected() public {
        _activate();
        _verifyHolder(alice);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 10, 10 * REF_PRICE);
        _exec(o, sig);
        vm.expectRevert(VenueSeries.OrderUsed.selector);
        _exec(o, sig);
    }

    function test_order_expiredRejected() public {
        _activate();
        _verifyHolder(alice);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 10, 10 * REF_PRICE);
        vm.warp(o.deadline + 1);
        vm.expectRevert(VenueSeries.OrderExpired.selector);
        _exec(o, sig);
    }

    function test_order_onlyPlatformExecutes() public {
        _activate();
        _verifyHolder(alice);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 10, 10 * REF_PRICE);
        VenueSeries.Order[] memory os = new VenueSeries.Order[](1);
        bytes[] memory sigs = new bytes[](1);
        os[0] = o;
        sigs[0] = sig;
        vm.prank(alice); // investor tidak bisa mengambil token sendiri tanpa platform mengonfirmasi rupiahnya masuk
        vm.expectRevert();
        series.allocate(os, sigs, bytes32(0));
    }

    function test_allocate_formsLockedLot() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        assertEq(token.balanceOf(alice), 10_000);
        assertEq(token.balanceOf(treasury), SUPPLY - 10_000);
        assertEq(token.unlockedBalanceOf(alice), 0);
        assertEq(series.holderCount(), 1);
        vm.warp(block.timestamp + 600);
        assertEq(token.unlockedBalanceOf(alice), 10_000);
    }

    function test_allocate_requiresAllowlist() public {
        _activate();
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 1, REF_PRICE);
        vm.expectRevert(abi.encodeWithSelector(VenueSeries.NotVerified.selector, alice));
        _exec(o, sig);
    }

    function test_allocate_cannotExceedTreasury() public {
        _activate();
        _verifyHolder(alice);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, SUPPLY + 1, (SUPPLY + 1) * REF_PRICE);
        vm.expectRevert(VenueSeries.InsufficientTreasury.selector);
        _exec(o, sig);
    }

    function test_allocate_frozenRejected() public {
        _activate();
        _verifyHolder(alice);
        vm.prank(controller);
        series.setFrozen(alice, true);
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 1, REF_PRICE);
        vm.expectRevert(abi.encodeWithSelector(VenueSeries.IsFrozen.selector, alice));
        _exec(o, sig);
    }

    function test_lots_mergeWhenFullNeverUnlockEarlier() public {
        _activate();
        _verifyHolder(alice);
        // via_ir bisa membaca ulang block.timestamp untuk variabel lokal: pakai vm.getBlockTimestamp() untuk waktu sebenarnya
        for (uint256 i = 0; i < 33; i++) {
            vm.warp(vm.getBlockTimestamp() + 1);
            _allocate(PK_ALICE, 1);
        }
        SeriesToken.Lot[] memory ls = token.lotsOf(alice);
        assertEq(ls.length, 32);
        assertEq(ls[31].amount, 2);
        assertGt(ls[31].unlockAt, ls[30].unlockAt);
        assertEq(ls[31].unlockAt, uint64(vm.getBlockTimestamp() + 600));
    }

    // ================================================================== waterfall dan jatah (contoh PRD §4.6)

    function test_waterfall_matchesPrdExample() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000); // 10% supply, membayar Rp100 juta
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        VenueSeries.Period memory p = series.periodOf(1);
        assertEq(p.distributable, 15_000_000, "D");
        assertEq(p.poolInvestors, 7_350_000, "P_inv setelah m 2%");
        assertEq(p.deltaE18, 73.5e18, "jatah per token Rp73,5");
        assertEq(series.claimableOf(alice), 735_000, "pemegang 10.000 token");
        assertEq(p.owedIdr, 735_000, "kewajiban = token di luar treasury x jatah");
        assertEq(series.claimableOf(treasury), 6_615_000, "bagian token treasury kembali ke Grounds");
    }

    function test_waterfall_deductionsAboveGrossRevert() public {
        _activate();
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        w.refunds = 30_000_000;
        uint64 end = uint64(block.timestamp - 1);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.DeductionsExceedGross.selector);
        series.postRevenuePeriod(1, end, w, bytes32(0), _deadline(), new bytes[](0));
    }

    function test_waterfall_zeroWhenBreakEven() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 1000);
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        w.opex = 30_000_000;
        w.operatorFee = 16_000_000; // 52 − 1 − 30 − 1,5 − 16 − 2 − 1,5 = 0
        _post(1, w, PK_PLATFORM, PK_OWNER);
        assertEq(series.periodOf(1).distributable, 0);
        assertTrue(series.periodOf(1).settled, "tanpa kewajiban = otomatis lunas");
    }

    function test_poolConservedAcrossPeriods() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 3);
        VenueSeries.Waterfall memory w = VenueSeries.Waterfall(1001, 0, 0, 0, 0, 0, 0);
        _post(1, w, PK_PLATFORM, PK_OWNER);
        vm.warp(block.timestamp + 31 days);
        _post(2, w, PK_PLATFORM, PK_OWNER);
        uint256 pool = 2 * (uint256(1001) * 5000 / 10_000 - (uint256(1001) * 5000 / 10_000) * 200 / 10_000);
        assertEq(series.accPerTokenE18() * SUPPLY + series.dustE18(), pool * 1e18);
    }

    function test_revenue_verifierOnlyAfterOwnerSilent() public {
        _activate();
        uint64 end = uint64(block.timestamp - 1);
        VenueSeries.Waterfall memory w = _exampleWaterfall();
        bytes32 ev = bytes32("ev");
        bytes32 payload = keccak256(abi.encode(uint256(1), end, w, ev));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, 1, payload, dl, PK_PLATFORM, PK_VERIFIER);
        uint8 slot = registry.SLOT_VERIFIER();
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.SlotNotAllowed.selector, slot));
        series.postRevenuePeriod(1, end, w, ev, dl, sigs);

        vm.warp(uint256(end) + 3 days + 1); // owner diam: owner tidak bisa menyandera pembayaran investor
        dl = _deadline();
        sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, 1, payload, dl, PK_PLATFORM, PK_VERIFIER);
        vm.prank(controller);
        series.postRevenuePeriod(1, end, w, ev, dl, sigs);
        assertEq(series.lastPeriodId(), 1);
    }

    // ================================================================== kewajiban, Overdue, Defaulted

    function test_payout_cannotExceedOwed() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.ExceedsOwed.selector);
        series.settlePayout(1, 735_001, bytes32("r"));
    }

    function test_payout_onlyPlatform() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        vm.prank(owner);
        vm.expectRevert();
        series.settlePayout(1, 735_000, bytes32("r"));
    }

    function test_overdue_publicAfterDeadline_thenRecovered() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);

        vm.expectRevert(VenueSeries.NotOverdueYet.selector);
        series.markOverdue(1);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(makeAddr("anyone")); // siapa pun boleh memicu
        series.markOverdue(1);
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Overdue));

        // saat Overdue: tidak ada alokasi baru
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 1, REF_PRICE);
        vm.expectRevert(abi.encodeWithSelector(VenueSeries.WrongState.selector, VenueSeries.State.Overdue));
        _exec(o, sig);

        _settlePayout(1, 735_000);
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Active));
        assertTrue(series.periodOf(1).settled);
    }

    function test_defaulted_afterGrace_thenRestored() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        vm.warp(block.timestamp + 7 days + 1);
        series.markOverdue(1);
        vm.expectRevert(VenueSeries.NotOverdueYet.selector);
        series.markDefaulted(1);
        vm.warp(block.timestamp + 14 days);
        series.markDefaulted(1);
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Defaulted));

        vm.prank(admin);
        vm.expectRevert(VenueSeries.UnsettledPeriods.selector);
        series.restoreFromDefault();
        _settlePayout(1, 735_000);
        vm.prank(admin);
        series.restoreFromDefault();
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Active));
    }

    function test_payout_partialThenComplete() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        _settlePayout(1, 400_000);
        assertFalse(series.periodOf(1).settled);
        _settlePayout(1, 335_000);
        assertTrue(series.periodOf(1).settled);
        assertEq(series.periodOf(1).payoutCount, 2);
    }

    // ================================================================== jual balik

    function test_sellback_onlyUnlockedLots() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 100);
        (VenueSeries.SellBack memory r, bytes memory sig) = _sellBack(PK_ALICE, 40);
        vm.prank(controller);
        vm.expectRevert(SeriesToken.LockedTokens.selector);
        series.executeSellBack(r, sig, bytes32(0));

        vm.warp(block.timestamp + 600);
        (r, sig) = _sellBack(PK_ALICE, 40);
        vm.prank(controller);
        series.executeSellBack(r, sig, bytes32("buyback"));
        assertEq(token.balanceOf(alice), 60);
        assertEq(token.balanceOf(treasury), SUPPLY - 60, "kembali ke treasury, tidak dibakar");
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_sellback_needsHolderSignature() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 100);
        vm.warp(block.timestamp + 600);
        VenueSeries.SellBack memory r = VenueSeries.SellBack(alice, 100, 100 * REF_PRICE, 9, _deadline());
        bytes memory forged = _sig(PK_PLATFORM, series.sellBackDigest(r)); // platform menjual token alice tanpa izinnya
        vm.prank(controller);
        vm.expectRevert(VenueSeries.BadInvestorSignature.selector);
        series.executeSellBack(r, forged, bytes32(0));
    }

    function test_sellback_keepsEarnedShare() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER);
        vm.warp(block.timestamp + 600);
        (VenueSeries.SellBack memory r, bytes memory sig) = _sellBack(PK_ALICE, 10_000);
        vm.prank(controller);
        series.executeSellBack(r, sig, bytes32(0));
        assertEq(series.claimableOf(alice), 735_000, "jatah yang sudah diperoleh tetap milik investor");
        assertEq(series.holderCount(), 0);
    }

    // ================================================================== sengketa, revaluasi, kepatuhan, penutup

    function test_dispute_blocksItem_verifierResolves() public {
        _activate();
        bytes32 ref = series.periodRef(1);
        vm.prank(owner);
        series.raiseDispute(ref, keccak256("angka beda"));
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Disputed));

        uint64 end = uint64(block.timestamp - 1);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.ItemDisputed.selector);
        series.postRevenuePeriod(1, end, _exampleWaterfall(), bytes32(0), _deadline(), new bytes[](0));

        vm.prank(owner);
        vm.expectRevert(VenueSeries.NotAttestor.selector);
        series.resolveDispute(ref, bytes32(0));

        vm.prank(verifier);
        series.resolveDispute(ref, keccak256("dimediasi"));
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Active));
    }

    function test_dispute_strangerCannotRaise() public {
        _activate();
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(VenueSeries.NotAttestor.selector);
        series.raiseDispute(bytes32("x"), bytes32(0));
    }

    function test_valuation_needsVerifier_newPriceForNewOrders() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 100);
        uint256 newVal = 2_400_000_000;
        uint256 newRef = newVal * 5000 / 10_000 / SUPPLY; // 12.000
        bytes32 payload = keccak256(abi.encode(uint256(1), newVal, newRef, bytes32(0)));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.VALUATION_UPDATE, 1, payload, dl, PK_PLATFORM, PK_OWNER);
        uint8 slot = registry.SLOT_COUNTERPARTY();
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.SlotNotAllowed.selector, slot));
        series.updateValuation(newVal, bytes32(0), dl, sigs);

        sigs = _sign(AttestationRegistry.Kind.VALUATION_UPDATE, 1, payload, dl, PK_PLATFORM, PK_VERIFIER);
        series.updateValuation(newVal, bytes32(0), dl, sigs);
        assertEq(series.refPriceIdr(), 12_000);
        assertEq(token.balanceOf(alice), 100, "jumlah token tidak berubah");

        // pesanan dengan harga lama tidak lagi berlaku
        (VenueSeries.Order memory o, bytes memory sig) = _order(PK_ALICE, 1, REF_PRICE);
        vm.expectRevert(VenueSeries.BadPrice.selector);
        _exec(o, sig);
        _allocate(PK_ALICE, 1);
        assertEq(token.balanceOf(alice), 101);
    }

    function test_forcedTransfer_requiresVerifiedRecipientAndReason() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 100);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(VenueSeries.NotVerified.selector, bob));
        series.forcedTransfer(alice, bob, 10, keccak256("court-order"));
        _verifyHolder(bob);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.BadParams.selector);
        series.forcedTransfer(alice, bob, 10, bytes32(0));
        vm.prank(controller);
        series.forcedTransfer(alice, bob, 10, keccak256("court-order"));
        assertEq(token.balanceOf(bob), 10);
        assertEq(token.lotsOf(bob)[0].unlockAt, token.lotsOf(alice)[0].unlockAt, "kunci ikut berpindah");
    }

    function test_liquidation_closeAfterFinalSettled() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 10_000);
        vm.prank(admin);
        series.beginLiquidation(keccak256("asset sale"));
        _post(1, _exampleWaterfall(), PK_PLATFORM, PK_OWNER); // distribusi akhir
        vm.prank(admin);
        vm.expectRevert(VenueSeries.UnsettledPeriods.selector);
        series.closeSeries();
        _settlePayout(1, 735_000);
        vm.prank(admin);
        series.closeSeries();
        assertEq(uint8(series.state()), uint8(VenueSeries.State.Closed));
        assertEq(token.totalSupply(), SUPPLY, "tanpa burn");
    }

    function test_registry_rotationNeedsDelay() public {
        address p2 = makeAddr("p2");
        address v2 = makeAddr("v2");
        vm.startPrank(admin);
        registry.proposeSigners(p2, v2);
        vm.expectRevert(AttestationRegistry.RotationNotReady.selector);
        registry.applySigners();
        vm.warp(block.timestamp + 1 days);
        registry.applySigners();
        vm.stopPrank();
        assertEq(registry.platform(), p2);
        assertEq(registry.verifier(), v2);
    }

    function test_registry_onlyRegisteredSeries() public {
        vm.expectRevert(AttestationRegistry.NotRegisteredSeries.selector);
        registry.verify(AttestationRegistry.Kind.REVENUE_PERIOD, 1, bytes32(0), _deadline(), false, new bytes[](0));
    }
}
