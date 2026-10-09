// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {SeriesToken} from "../src/SeriesToken.sol";

contract SeriesTokenTest is Base {
    function test_decimals_zero_and_symbol() public view {
        assertEq(token.decimals(), 0);
        assertEq(token.symbol(), "PDLA");
    }

    function test_only_series_can_mint_burn_allow() public {
        vm.startPrank(alice);
        vm.expectRevert(SeriesToken.OnlySeries.selector);
        token.mint(alice, 1);
        vm.expectRevert(SeriesToken.OnlySeries.selector);
        token.burn(alice, 1);
        vm.expectRevert(SeriesToken.OnlySeries.selector);
        token.setAllowed(alice, true);
        vm.stopPrank();
    }

    function test_mint_requires_allowlist() public {
        _open();
        address stranger = makeAddr("stranger");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(SeriesToken.NotAllowlisted.selector, stranger));
        series.recordPurchase(stranger, 1, bytes32(uint256(9)), false);
    }

    function test_transfers_locked() public {
        _open();
        _buy(alice, 10, bytes32(uint256(1)), false);
        vm.prank(alice);
        vm.expectRevert(SeriesToken.TransfersLocked.selector);
        token.transfer(bob, 1);
        vm.prank(alice);
        token.approve(bob, 1);
        vm.prank(bob);
        vm.expectRevert(SeriesToken.TransfersLocked.selector);
        token.transferFrom(alice, bob, 1);
    }

    function test_symbol_max_five_chars() public {
        vm.expectRevert(SeriesToken.SymbolTooLong.selector);
        new SeriesToken("x", "TOOLONG", address(this));
    }
}
