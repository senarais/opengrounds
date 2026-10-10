// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base} from "../Base.t.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";
import {SeriesToken} from "../../src/SeriesToken.sol";
import {VenueSeries} from "../../src/VenueSeries.sol";

/// @dev Random actors for the PRD v4.1 §6.7 invariant tests. Valid actions run with correct signatures (the investor for
///      their orders, platform + owner for the monthly profit); cheating actions are attempted and must revert (if not,
///      a ghost flag turns on).
contract Handler is Test {
    uint256 internal constant PK_PLATFORM = 0xA11CE;
    uint256 internal constant PK_VERIFIER = 0xB0B;
    uint256 internal constant PK_OWNER = 0xC0FFEE;

    VenueSeries public series;
    AttestationRegistry public registry;
    SeriesToken public token;
    address public controller;
    address public treasury;
    address[] public actors;
    uint256[] internal actorPks;

    uint256 public ghostPool; // Σ P_inv posted
    uint256 public ghostSettleOps; // accumulator settlement count (upper bound on rounding error)
    uint256 public lastEnd;
    uint256 internal nextOrder = 1000;
    uint256 internal sellRef = 1;
    VenueSeries.Order internal lastOrder;
    bytes internal lastOrderSig;

    bool public cheatInvestorTransfer;
    bool public cheatLockedLeft;
    bool public cheatReplay;
    bool public cheatWrongPrice;
    bool public cheatOverGross;
    bool public cheatForgedOrder;

    constructor(VenueSeries s, AttestationRegistry r, address controller_, address treasury_, uint256[] memory pks) {
        series = s;
        registry = r;
        token = s.token();
        controller = controller_;
        treasury = treasury_;
        for (uint256 i = 0; i < pks.length; i++) {
            actorPks.push(pks[i]);
            actors.push(vm.addr(pks[i]));
        }
    }

    function _execOrder(VenueSeries.Order memory o, bytes memory sig) internal {
        VenueSeries.Order[] memory os = new VenueSeries.Order[](1);
        bytes[] memory sigs = new bytes[](1);
        os[0] = o;
        sigs[0] = sig;
        vm.prank(controller);
        series.allocate(os, sigs, bytes32(0));
    }

    function _sig(uint256 pk, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r_, bytes32 s_) = vm.sign(pk, d);
        return abi.encodePacked(r_, s_, v);
    }

    function _two(AttestationRegistry.Kind k, uint256 refId, bytes32 payload, uint64 dl, uint256 a, uint256 b)
        internal
        view
        returns (bytes[] memory sigs)
    {
        bytes32 d = registry.digest(k, address(series), refId, payload, dl);
        sigs = new bytes[](2);
        sigs[0] = _sig(a, d);
        sigs[1] = _sig(b, d);
    }

    function _now() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    // ------------------------------------------------------------------ valid actions

    function allocate(uint256 seed, uint256 amount) external {
        if (series.state() != VenueSeries.State.Active) return;
        uint256 avail = token.balanceOf(treasury);
        if (avail == 0) return;
        amount = bound(amount, 1, avail < 5000 ? avail : 5000);
        uint256 k = seed % actors.length;
        VenueSeries.Order memory o =
            VenueSeries.Order(actors[k], amount, amount * series.refPriceIdr(), nextOrder++, uint64(_now() + 1 hours));
        bytes memory sig = _sig(actorPks[k], series.orderDigest(o));
        _execOrder(o, sig);
        ghostSettleOps += 2;
        lastOrder = o;
        lastOrderSig = sig;
    }

    function postPeriod(uint256 gross, uint256 opexBps, uint256 taxBps) external {
        if (series.state() != VenueSeries.State.Active) return;
        uint256 t = _now();
        if (t <= lastEnd + 1) {
            t = lastEnd + 2;
            vm.warp(t);
        }
        gross = bound(gross, 0, 1_000_000_000);
        uint256 opex = (gross * bound(opexBps, 0, 8000)) / 10_000;
        uint256 tax = ((gross - opex) * bound(taxBps, 0, 10_000)) / 10_000;
        VenueSeries.Waterfall memory w = VenueSeries.Waterfall(gross, 0, opex, tax, 0, 0, 0);
        uint256 id = series.lastPeriodId() + 1;
        uint64 end = uint64(t - 1);
        bytes32 payload = keccak256(abi.encode(id, end, w, bytes32(0)));
        uint64 dl = uint64(t + 1 hours);
        bytes[] memory sigs = _two(AttestationRegistry.Kind.REVENUE_PERIOD, id, payload, dl, PK_PLATFORM, PK_OWNER);
        vm.prank(controller);
        series.postRevenuePeriod(id, end, w, bytes32(0), dl, sigs);
        uint256 d = gross - opex - tax;
        uint256 pSpv = (d * 5000) / 10_000;
        ghostPool += pSpv - (pSpv * 200) / 10_000;
        lastEnd = end;
    }

    function settle(uint256 pSeed, uint256 pct) external {
        uint256 last = series.lastPeriodId();
        if (last == 0) return;
        uint256 id = (pSeed % last) + 1;
        VenueSeries.Period memory p = series.periodOf(id);
        uint256 amount = ((p.owedIdr - p.paidIdr) * bound(pct, 0, 100)) / 100;
        if (amount == 0) return;
        vm.prank(controller);
        series.settlePayout(id, amount, keccak256(abi.encode(id, p.payoutCount)));
    }

    function sellBack(uint256 seed, uint256 amount) external {
        if (series.state() != VenueSeries.State.Active) return;
        uint256 k = seed % actors.length;
        uint256 unlocked = token.unlockedBalanceOf(actors[k]);
        if (unlocked == 0) return;
        amount = bound(amount, 1, unlocked);
        VenueSeries.SellBack memory r =
            VenueSeries.SellBack(actors[k], amount, amount * series.refPriceIdr(), sellRef++, uint64(_now() + 1 hours));
        bytes memory sig = _sig(actorPks[k], series.sellBackDigest(r));
        vm.prank(controller);
        series.executeSellBack(r, sig, bytes32(0));
        ghostSettleOps += 2;
    }

    function warp(uint256 dt) external {
        vm.warp(_now() + bound(dt, 0, 2 days));
    }

    // ------------------------------------------------------------------ cheating attempts (must revert)

    function tryInvestorTransfer(uint256 a, uint256 b, uint256 amount) external {
        address from = actors[a % actors.length];
        address to = actors[b % actors.length];
        if (token.balanceOf(from) == 0) return;
        vm.prank(from);
        try token.transfer(to, bound(amount, 1, token.balanceOf(from))) {
            cheatInvestorTransfer = true;
        } catch {}
    }

    function tryLockedSellBack(uint256 seed) external {
        if (series.state() != VenueSeries.State.Active) return;
        uint256 k = seed % actors.length;
        uint256 bal = token.balanceOf(actors[k]);
        uint256 unlocked = token.unlockedBalanceOf(actors[k]);
        if (bal <= unlocked) return;
        uint256 amount = unlocked + 1;
        VenueSeries.SellBack memory r =
            VenueSeries.SellBack(actors[k], amount, amount * series.refPriceIdr(), sellRef++, uint64(_now() + 1 hours));
        bytes memory sig = _sig(actorPks[k], series.sellBackDigest(r));
        vm.prank(controller);
        try series.executeSellBack(r, sig, bytes32(0)) {
            cheatLockedLeft = true;
        } catch {}
    }

    function tryReplay() external {
        if (lastOrder.orderId == 0) return;
        VenueSeries.Order[] memory os = new VenueSeries.Order[](1);
        bytes[] memory sigs = new bytes[](1);
        os[0] = lastOrder;
        sigs[0] = lastOrderSig;
        vm.prank(controller);
        try series.allocate(os, sigs, bytes32(0)) {
            cheatReplay = true;
        } catch {}
    }

    function tryWrongPrice(uint256 seed, uint256 delta) external {
        if (series.state() != VenueSeries.State.Active || token.balanceOf(treasury) == 0) return;
        uint256 k = seed % actors.length;
        VenueSeries.Order memory o = VenueSeries.Order(
            actors[k], 1, series.refPriceIdr() + bound(delta, 1, 1e9), nextOrder++, uint64(_now() + 1 hours)
        );
        bytes memory sig = _sig(actorPks[k], series.orderDigest(o)); // the investor agrees, still rejected
        VenueSeries.Order[] memory os = new VenueSeries.Order[](1);
        bytes[] memory sigs = new bytes[](1);
        os[0] = o;
        sigs[0] = sig;
        vm.prank(controller);
        try series.allocate(os, sigs, bytes32(0)) {
            cheatWrongPrice = true;
        } catch {}
    }

    function tryOverGross(uint256 gross) external {
        if (series.state() != VenueSeries.State.Active) return;
        gross = bound(gross, 1, 1e9);
        VenueSeries.Waterfall memory w = VenueSeries.Waterfall(gross, gross, 0, 1, 0, 0, 0);
        uint256 id = series.lastPeriodId() + 1;
        uint64 end = uint64(_now() - 1);
        if (end <= lastEnd) return;
        bytes32 payload = keccak256(abi.encode(id, end, w, bytes32(0)));
        uint64 dl = uint64(_now() + 1 hours);
        bytes[] memory sigs = _two(AttestationRegistry.Kind.REVENUE_PERIOD, id, payload, dl, PK_PLATFORM, PK_OWNER);
        vm.prank(controller);
        try series.postRevenuePeriod(id, end, w, bytes32(0), dl, sigs) {
            cheatOverGross = true;
        } catch {}
    }

    /// @dev The platform tries to issue tokens without the investor's signature (signing on the investor's behalf).
    function tryForgedOrder(uint256 seed) external {
        if (series.state() != VenueSeries.State.Active || token.balanceOf(treasury) == 0) return;
        VenueSeries.Order memory o = VenueSeries.Order(
            actors[seed % actors.length], 1, series.refPriceIdr(), nextOrder++, uint64(_now() + 1 hours)
        );
        bytes memory sig = _sig(PK_PLATFORM, series.orderDigest(o));
        VenueSeries.Order[] memory os = new VenueSeries.Order[](1);
        bytes[] memory sigs = new bytes[](1);
        os[0] = o;
        sigs[0] = sig;
        vm.prank(controller);
        try series.allocate(os, sigs, bytes32(0)) {
            cheatForgedOrder = true;
        } catch {}
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }
}

contract VenueSeriesInvariant is Base {
    Handler internal handler;
    address[] internal actors;

    function setUp() public override {
        super.setUp();
        _activate();
        uint256[] memory pks = new uint256[](3);
        pks[0] = 0x1001;
        pks[1] = 0x1002;
        pks[2] = 0x1003;
        for (uint256 i = 0; i < pks.length; i++) {
            actors.push(vm.addr(pks[i]));
            _verifyHolder(actors[i]);
        }
        handler = new Handler(series, registry, controller, treasury, pks);
        targetContract(address(handler));
    }

    /// 1. totalSupply does not change after activate (no further mint or burn).
    function invariant_supplyFixed() public view {
        assertEq(token.totalSupply(), SUPPLY);
    }

    /// 2. The sum of all balances = totalSupply.
    function invariant_balancesSumToSupply() public view {
        uint256 sum = token.balanceOf(treasury);
        for (uint256 i = 0; i < actors.length; i++) {
            sum += token.balanceOf(actors[i]);
        }
        assertEq(sum, token.totalSupply());
    }

    /// 3. For every period, attested payments never exceed the obligation.
    function invariant_paidNeverExceedsOwed() public view {
        uint256 last = series.lastPeriodId();
        for (uint256 i = 1; i <= last; i++) {
            VenueSeries.Period memory p = series.periodOf(i);
            assertLe(p.paidIdr, p.owedIdr);
        }
    }

    /// 4–9. Cheating actions never succeed.
    function invariant_noInvestorToInvestorTransfer() public view {
        assertFalse(handler.cheatInvestorTransfer());
    }

    function invariant_lockedLotsNeverLeave() public view {
        assertFalse(handler.cheatLockedLeft());
    }

    function invariant_attestationNotReusable() public view {
        assertFalse(handler.cheatReplay());
    }

    function invariant_wrongPriceAlwaysReverts() public view {
        assertFalse(handler.cheatWrongPrice());
    }

    function invariant_overGrossAlwaysReverts() public view {
        assertFalse(handler.cheatOverGross());
    }

    function invariant_noTokenWithoutInvestorSignature() public view {
        assertFalse(handler.cheatForgedOrder());
    }

    /// 10. No rupiah is lost or created: accumulator × supply + dust = total pool; all holders' shares ≤ pool, with the
    ///     difference coming only from rounding down.
    function invariant_poolConservation() public view {
        assertEq(series.accPerTokenE18() * SUPPLY + series.dustE18(), handler.ghostPool() * 1e18);
        uint256 claims = series.claimableOf(treasury);
        for (uint256 i = 0; i < actors.length; i++) {
            claims += series.claimableOf(actors[i]);
        }
        assertLe(claims, handler.ghostPool());
        assertLe(handler.ghostPool() - claims, handler.ghostSettleOps() + actors.length + 2);
    }
}
