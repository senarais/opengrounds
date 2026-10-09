// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {SeriesToken} from "../src/SeriesToken.sol";
import {VenueSeries} from "../src/VenueSeries.sol";

/// @dev Penyiapan bersama: tiga slot penanda tangan, satu seri dengan parameter contoh PRD v4.1 §10.2.
abstract contract Base is Test {
    uint256 internal constant PK_PLATFORM = 0xA11CE;
    uint256 internal constant PK_VERIFIER = 0xB0B;
    uint256 internal constant PK_OWNER = 0xC0FFEE;
    uint256 internal constant PK_STRANGER = 0xBAD;
    uint256 internal constant PK_ALICE = 0xA71CE;
    uint256 internal constant PK_BOB = 0xB0BB;

    // contoh PRD §4.6: V = Rp2 miliar, X = 50%, p = Rp10.000, N = 100.000
    uint256 internal constant VALUATION = 2_000_000_000;
    uint256 internal constant SUPPLY = 100_000;
    uint256 internal constant REF_PRICE = 10_000;

    address internal platform;
    address internal verifier;
    address internal owner;
    address internal admin = makeAddr("admin");
    address internal controller = makeAddr("controller");
    address internal treasury = makeAddr("treasury");

    AttestationRegistry internal registry;
    VenueSeries internal series;
    SeriesToken internal token;
    uint256 internal nextOrder = 1;
    uint256 internal nextSellBack = 1;

    function setUp() public virtual {
        platform = vm.addr(PK_PLATFORM);
        verifier = vm.addr(PK_VERIFIER);
        owner = vm.addr(PK_OWNER);
        registry = new AttestationRegistry(admin, platform, verifier);
        series = new VenueSeries(admin, controller, registry, treasury, "Grounds Venue A", "GVA", defaultParams());
        token = series.token();
        vm.prank(admin);
        registry.registerSeries(address(series), owner);
        vm.warp(1_800_000_000);
    }

    function defaultParams() internal pure returns (VenueSeries.Params memory) {
        return VenueSeries.Params({
            stakeBps: 5000, // X 50%
            spvFeeBps: 200, // m 2%
            maxOpexBps: 8000, // plafon opex 80% gross
            sellbackDiscountBps: 0, // d 0%
            maxHoldingBps: 10_000,
            lockPeriod: 600, // demo mode: 10 menit
            payoutWindow: 7 days,
            defaultGrace: 14 days,
            ownerSignWindow: 3 days
        });
    }

    // ------------------------------------------------------------------ tanda tangan

    function _sig(uint256 pk, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }

    function _sign(AttestationRegistry.Kind kind, uint256 refId, bytes32 payload, uint64 deadline, uint256 pkA, uint256 pkB)
        internal
        view
        returns (bytes[] memory sigs)
    {
        bytes32 d = registry.digest(kind, address(series), refId, payload, deadline);
        sigs = new bytes[](2);
        sigs[0] = _sig(pkA, d);
        sigs[1] = _sig(pkB, d);
    }

    function _sign1(AttestationRegistry.Kind kind, uint256 refId, bytes32 payload, uint64 deadline, uint256 pk)
        internal
        view
        returns (bytes[] memory sigs)
    {
        sigs = new bytes[](1);
        sigs[0] = _sig(pk, registry.digest(kind, address(series), refId, payload, deadline));
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    // ------------------------------------------------------------------ alur umum

    function _activate() internal {
        vm.prank(admin);
        series.markVerified(keccak256("kyb"));
        bytes32 ev = keccak256("acquisition");
        bytes32 payload = keccak256(abi.encode(VALUATION, SUPPLY, REF_PRICE, uint16(5000), uint16(200), ev));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.ACQUISITION_CLOSED, 0, payload, dl, PK_PLATFORM, PK_OWNER);
        series.activate(VALUATION, SUPPLY, REF_PRICE, ev, dl, sigs);
    }

    function _verifyHolder(address a) internal {
        vm.prank(controller);
        series.setVerified(a, true);
    }

    /// @dev Pesanan beli yang ditandatangani investor (EIP-712), seperti yang dilakukan Privy di aplikasi.
    function _order(uint256 pkInvestor, uint256 tokens, uint256 paidIdr) internal returns (VenueSeries.Order memory o, bytes memory sig) {
        o = VenueSeries.Order({investor: vm.addr(pkInvestor), tokens: tokens, paidIdr: paidIdr, orderId: nextOrder++, deadline: _deadline()});
        sig = _sig(pkInvestor, series.orderDigest(o));
    }

    function _allocate(uint256 pkInvestor, uint256 tokens) internal returns (uint256 orderId) {
        (VenueSeries.Order memory o, bytes memory sig) = _order(pkInvestor, tokens, tokens * series.refPriceIdr());
        _exec(o, sig);
        return o.orderId;
    }

    function _exec(VenueSeries.Order memory o, bytes memory sig) internal {
        VenueSeries.Order[] memory os = new VenueSeries.Order[](1);
        bytes[] memory sigs = new bytes[](1);
        os[0] = o;
        sigs[0] = sig;
        vm.prank(controller);
        series.allocate(os, sigs, keccak256(abi.encode("xendit-invoice", o.orderId)));
    }

    function _sellBack(uint256 pkHolder, uint256 tokens) internal returns (VenueSeries.SellBack memory r, bytes memory sig) {
        uint256 paid = tokens * series.refPriceIdr();
        r = VenueSeries.SellBack({holder: vm.addr(pkHolder), tokens: tokens, paidIdr: paid, requestId: nextSellBack++, deadline: _deadline()});
        sig = _sig(pkHolder, series.sellBackDigest(r));
    }

    /// @dev Contoh satu bulan PRD §4.6: D = Rp15 juta.
    function _exampleWaterfall() internal pure returns (VenueSeries.Waterfall memory) {
        return VenueSeries.Waterfall({
            gross: 52_000_000,
            refunds: 1_000_000,
            opex: 27_000_000,
            tax: 1_500_000,
            operatorFee: 4_000_000,
            reserve: 2_000_000,
            platformFee: 1_500_000
        });
    }

    function _post(uint256 periodId, VenueSeries.Waterfall memory w, uint256 pkA, uint256 pkB) internal {
        uint64 end = uint64(block.timestamp - 1);
        bytes32 ev = keccak256(abi.encode("period", periodId));
        bytes32 payload = keccak256(abi.encode(periodId, end, w, ev));
        uint64 dl = _deadline();
        bytes[] memory sigs = _sign(AttestationRegistry.Kind.REVENUE_PERIOD, periodId, payload, dl, pkA, pkB);
        vm.prank(controller);
        series.postRevenuePeriod(periodId, end, w, ev, dl, sigs);
    }

    function _settlePayout(uint256 periodId, uint256 paid) internal {
        vm.prank(controller);
        series.settlePayout(periodId, paid, keccak256(abi.encode("root", periodId, paid)));
    }
}
