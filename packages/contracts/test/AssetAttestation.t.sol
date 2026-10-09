// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {AssetAttestation} from "../src/AssetAttestation.sol";

contract AssetAttestationTest is Base {
    function test_pass_with_two_signatures() public {
        _attestPass();
        assertTrue(att.isValid(address(series)));
        assertEq(att.maxPrice(address(series)), 20_000);
    }

    function test_revert_one_signature_for_pass() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        bytes[] memory s = _sign(a, 1);
        vm.expectRevert(abi.encodeWithSelector(AssetAttestation.NotEnoughSignatures.selector, 1, 2));
        att.submit(a, s);
    }

    function test_revert_signers_not_ascending() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        bytes[] memory s = _sign(a, 2);
        (s[0], s[1]) = (s[1], s[0]);
        vm.expectRevert(AssetAttestation.SignersNotAscending.selector);
        att.submit(a, s);
    }

    function test_revert_duplicate_signer() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        bytes[] memory s = _sign(a, 1);
        bytes[] memory dup = new bytes[](2);
        dup[0] = s[0];
        dup[1] = s[0];
        vm.expectRevert(AssetAttestation.SignersNotAscending.selector);
        att.submit(a, dup);
    }

    function test_revert_non_signer() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        bytes32 d = att.hashAttestation(a);
        bytes[] memory s = new bytes[](2);
        for (uint256 i = 0; i < 2; i++) {
            (uint8 v, bytes32 r, bytes32 ss) = vm.sign(0xDEAD + i, d);
            s[i] = abi.encodePacked(r, ss, v);
        }
        vm.expectRevert(AssetAttestation.NotSigner.selector);
        att.submit(a, s);
    }

    function test_revert_tampered_payload_after_signing() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        bytes[] memory s = _sign(a, 2);
        a.maxPrice = 99_000; // dinaikkan setelah ditandatangani
        vm.expectRevert(); // penandatangan yang dipulihkan acak => NotSigner
        att.submit(a, s);
    }

    function test_override_ai_fail_needs_all_three_and_reason() public {
        AssetAttestation.Attestation memory a = _att(1, 2, 20_000); // AI bilang fail, manusia pass
        bytes[] memory s3 = _sign(a, 3);
        vm.expectRevert(AssetAttestation.OverrideNeedsReason.selector);
        att.submit(a, s3);

        a.overrideReasonHash = keccak256("banding: bukti tambahan");
        s3 = _sign(a, 3);
        bytes[] memory s2 = _sign(a, 2);
        vm.expectRevert(abi.encodeWithSelector(AssetAttestation.NotEnoughSignatures.selector, 2, 3));
        att.submit(a, s2);

        att.submit(a, s3);
        assertTrue(att.isValid(address(series)));
    }

    function test_fail_verdict_needs_one_signature_and_is_not_valid() public {
        AssetAttestation.Attestation memory a = _att(2, 2, 20_000);
        att.submit(a, _sign(a, 1));
        assertFalse(att.isValid(address(series)));
    }

    function test_replay_same_nonce_reverts() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        bytes[] memory s = _sign(a, 2);
        att.submit(a, s);
        vm.expectRevert(AssetAttestation.BadNonce.selector);
        att.submit(a, s);
    }

    function test_new_nonce_supersedes_and_resets_revoke() public {
        _attestPass();
        vm.prank(sa[0]);
        att.revoke(address(series), keccak256("x"));
        assertFalse(att.isValid(address(series)));
        _attestPass();
        assertTrue(att.isValid(address(series)));
    }

    function test_expiry_checks() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        a.expiry = uint64(block.timestamp);
        bytes[] memory s = _sign(a, 2);
        vm.expectRevert(AssetAttestation.Expired.selector);
        att.submit(a, s);
        a.expiry = uint64(block.timestamp + 91 days);
        s = _sign(a, 2);
        vm.expectRevert(AssetAttestation.ExpiryTooFar.selector);
        att.submit(a, s);
    }

    function test_valid_until_expiry() public {
        _attestPass();
        vm.warp(block.timestamp + 31 days);
        assertFalse(att.isValid(address(series)));
    }

    function test_revoke_only_signer() public {
        _attestPass();
        vm.prank(alice);
        vm.expectRevert(AssetAttestation.NotSigner.selector);
        att.revoke(address(series), bytes32(0));
        vm.prank(sa[1]);
        att.revoke(address(series), keccak256("fraud"));
        assertFalse(att.isValid(address(series)));
    }

    function test_share_cap_across_series() public {
        _attestPass(); // maxShare 1500, maxTotal 2000
        address other = makeAddr("otherSeries");
        AssetAttestation.Attestation memory b = _att(1, 1, 20_000);
        b.series = other;
        b.nonce = 0;
        att.submit(b, _sign(b, 2));

        vm.prank(address(series));
        att.lockShare(1500);
        vm.prank(other);
        vm.expectRevert(AssetAttestation.TotalShareTooHigh.selector);
        att.lockShare(1000); // 1500 + 1000 > 2000
        vm.prank(other);
        att.lockShare(500);
        assertEq(att.totalShareBps(ASSET), 2000);

        vm.prank(address(series));
        att.releaseShare();
        assertEq(att.totalShareBps(ASSET), 500);
    }

    function test_lockShare_above_series_max_reverts() public {
        _attestPass();
        vm.prank(address(series));
        vm.expectRevert(AssetAttestation.ShareTooHigh.selector);
        att.lockShare(1600);
    }

    function test_constructor_rejects_duplicate_signers() public {
        address[3] memory bad = [sa[0], sa[0], sa[1]];
        vm.expectRevert(AssetAttestation.BadSigners.selector);
        new AssetAttestation(bad);
    }

    function test_pass_needs_independent_signer() public {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        uint256[] memory teamOnly = new uint256[](2);
        teamOnly[0] = 0;
        teamOnly[1] = 1; // dua anggota tim, tanpa pihak independen (sa[2])
        bytes[] memory s = _signWith(a, teamOnly);
        vm.expectRevert(AssetAttestation.IndependentRequired.selector);
        att.submit(a, s);

        uint256[] memory teamPlusIndependent = new uint256[](2);
        teamPlusIndependent[0] = 0;
        teamPlusIndependent[1] = 2;
        att.submit(a, _signWith(a, teamPlusIndependent));
        assertTrue(att.isValid(address(series)));
    }

    function test_veto_by_team_member_alone_still_works() public {
        AssetAttestation.Attestation memory a = _att(2, 1, 20_000); // FAIL
        uint256[] memory one = new uint256[](1);
        one[0] = 0; // anggota tim saja
        att.submit(a, _signWith(a, one));
        assertFalse(att.isValid(address(series)));
    }

    function test_override_of_ai_fail_still_needs_all_three() public {
        AssetAttestation.Attestation memory a = _att(1, 2, 20_000); // PASS meski AI bilang FAIL
        a.overrideReasonHash = keccak256("alasan");
        bytes[] memory two = _sign(a, 2);
        vm.expectRevert(abi.encodeWithSelector(AssetAttestation.NotEnoughSignatures.selector, 2, 3));
        att.submit(a, two);
        att.submit(a, _sign(a, 3));
        assertTrue(att.isValid(address(series)));
    }
}
