// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetAttestation} from "../src/AssetAttestation.sol";
import {IAssetAttestation} from "../src/interfaces/IAssetAttestation.sol";
import {Series} from "../src/Series.sol";
import {SeriesToken} from "../src/SeriesToken.sol";

/// Skenario dasar: target Rp150jt, minRaise Rp100jt, harga Rp15.000 => cap 10.000 token, 10% omzet, tenor 365 hari.
abstract contract Base is Test {
    AssetAttestation internal att;
    Series internal series;
    SeriesToken internal token;

    uint256[3] internal keys; // terurut naik menurut alamat
    address[3] internal sa;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal ownerBuyer = makeAddr("ownerBuyer");

    uint256 internal constant UNIT = 15_000;
    uint256 internal constant TARGET = 150_000_000;
    uint256 internal constant MIN_RAISE = 100_000_000;
    bytes32 internal constant ASSET = keccak256("venue-padel-1");

    function setUp() public virtual {
        _sortedKeys();
        att = new AssetAttestation(sa);
        series = new Series(
            admin,
            operator,
            sa[2], // pihak independen
            IAssetAttestation(address(att)),
            "Padel Alpha",
            "PDLA",
            Series.Terms({
                target: TARGET,
                minRaise: MIN_RAISE,
                unitPrice: UNIT,
                shareBps: 1000,
                tenorDays: 365,
                offeringDuration: 7 days
            })
        );
        token = series.token();
        vm.startPrank(operator);
        series.setKyc(alice, true);
        series.setKyc(bob, true);
        series.setKyc(carol, true);
        series.setKyc(ownerBuyer, true);
        vm.stopPrank();
    }

    function _sortedKeys() internal {
        uint256[3] memory k = [uint256(0xA11), uint256(0xB22), uint256(0xC33)];
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 j = i + 1; j < 3; j++) {
                if (vm.addr(k[j]) < vm.addr(k[i])) (k[i], k[j]) = (k[j], k[i]);
            }
        }
        keys = k;
        for (uint256 i = 0; i < 3; i++) sa[i] = vm.addr(k[i]);
    }

    function _att(uint8 verdict, uint8 ai, uint256 maxPrice_) internal view returns (AssetAttestation.Attestation memory a) {
        a = AssetAttestation.Attestation({
            series: address(series),
            assetId: ASSET,
            verdict: verdict,
            aiRecommendation: ai,
            score: 8200,
            evidenceRoot: keccak256("evidence"),
            rulesetHash: keccak256("ruleset-v1"),
            maxPrice: maxPrice_,
            maxShareBps: 1500,
            maxTotalShareBps: 2000,
            expiry: uint64(block.timestamp + 30 days),
            overrideReasonHash: bytes32(0),
            nonce: att.nonces(address(series))
        });
    }

    /// Menandatangani dengan n penandatangan TERAKHIR (urut naik), jadi selalu memuat pihak independen (sa[2]).
    function _sign(AssetAttestation.Attestation memory a, uint256 n) internal view returns (bytes[] memory sigs) {
        bytes32 digest = att.hashAttestation(a);
        sigs = new bytes[](n);
        for (uint256 i = 0; i < n; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[3 - n + i], digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }
    }

    /// Menandatangani dengan penandatangan terpilih (indeks pada sa, harus urut naik).
    function _signWith(AssetAttestation.Attestation memory a, uint256[] memory idx) internal view returns (bytes[] memory sigs) {
        bytes32 digest = att.hashAttestation(a);
        sigs = new bytes[](idx.length);
        for (uint256 i = 0; i < idx.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[idx[i]], digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }
    }

    function _attestPass() internal {
        AssetAttestation.Attestation memory a = _att(1, 1, 20_000);
        att.submit(a, _sign(a, 2));
    }

    function _open() internal {
        _attestPass();
        vm.prank(operator);
        series.openOffering();
    }

    function _buy(address who, uint256 units, bytes32 ref, bool related) internal {
        vm.prank(operator);
        series.recordPurchase(who, units, ref, related);
    }

    /// alice 5000 + bob 2000 = Rp105jt (>= minRaise), lalu tutup => Funded.
    function _fund() internal {
        _open();
        _buy(alice, 5000, bytes32(uint256(1)), false);
        _buy(bob, 2000, bytes32(uint256(2)), false);
        vm.warp(block.timestamp + 8 days);
        series.closeOffering();
    }

    function _active() internal {
        _fund();
        vm.prank(operator);
        series.releaseTranche1();
    }
}
