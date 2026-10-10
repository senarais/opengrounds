// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {VenueSeries} from "../src/VenueSeries.sol";
import {SeriesToken} from "../src/SeriesToken.sol";

/// @notice H-05 regression: `forcedTransfer` could mint and burn through `address(0)`.
///         `SeriesToken.treasury` is `address(0)` until `mintSupply`, so `from == treasury` was true
///         pre-activation (mint), and `setVerified(address(0), true)` had no guard (burn).
///         `tokens == 0` also drifted `holderCount`, which could block a holder's full exit.
///         Red before the guards, green after.
contract Regression_H05 is Base {
    address internal alice;
    address internal bob;

    function setUp() public override {
        super.setUp();
        alice = vm.addr(PK_ALICE);
        bob = vm.addr(PK_BOB);
    }

    // (a) Pre-activation mint: `forcedTransfer(address(0), holder, n)` must revert, never mint.
    function test_H05_preActivationMintReverts() public {
        _verifyHolder(alice);
        vm.prank(controller);
        vm.expectRevert(VenueSeries.BadParams.selector);
        series.forcedTransfer(address(0), alice, 1, keccak256("h05-mint"));

        // The series still activates with exactly the attested supply; no dilution.
        _activate();
        assertEq(token.totalSupply(), SUPPLY, "supply == attested supply");
        assertEq(series.supply(), SUPPLY);
    }

    // (b) address(0) cannot be allowlisted, nor used as a burn endpoint.
    function test_H05_zeroAddressBurnReverts() public {
        vm.prank(controller);
        vm.expectRevert(SeriesToken.ZeroAddress.selector);
        series.setVerified(address(0), true);

        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 100);

        vm.prank(controller);
        vm.expectRevert(VenueSeries.BadParams.selector);
        series.forcedTransfer(alice, address(0), 100, keccak256("h05-burn"));

        assertEq(token.totalSupply(), SUPPLY, "no burn");
        assertEq(token.balanceOf(alice), 100);
    }

    // (c) `tokens == 0` reverts instead of silently drifting `holderCount` and blocking exit.
    function test_H05_zeroAmountReverts() public {
        _activate();
        _verifyHolder(alice);
        _allocate(PK_ALICE, 100);
        assertEq(series.holderCount(), 1);

        vm.prank(controller);
        vm.expectRevert(VenueSeries.BadParams.selector);
        series.forcedTransfer(alice, bob, 0, keccak256("h05-zero"));
        assertEq(series.holderCount(), 1, "counter untouched");

        // The last holder can still exit in full (this reverted with a panic before the fix).
        vm.warp(block.timestamp + 601);
        (VenueSeries.SellBack memory r, bytes memory sig) = _sellBack(PK_ALICE, 100);
        vm.prank(controller);
        series.executeSellBack(r, sig, keccak256("xendit-sellback"));
        assertEq(token.balanceOf(alice), 0);
        assertEq(series.holderCount(), 0);
    }
}