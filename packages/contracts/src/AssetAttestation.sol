// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title AssetAttestation
/// @notice Registry bersama attestation EIP-712 quorum 2-dari-3. AI tidak menandatangani; manusia yang menandatangani.
/// @dev Veto mudah, approve sulit:
///  - verdict Pass butuh 2 tanda tangan;
///  - verdict Pass yang membatalkan rekomendasi AI "Fail" butuh SEMUA 3 penandatangan + overrideReasonHash != 0;
///  - verdict Fail cukup 1 tanda tangan, dan siapa pun dari 3 penandatangan bisa `revoke` kapan saja.
///  Tidak ada admin/upgrade: set penandatangan immutable.
contract AssetAttestation is EIP712 {
    uint8 public constant PASS = 1;
    uint8 public constant FAIL = 2;
    uint64 public constant MAX_VALIDITY = 90 days;

    struct Attestation {
        address series; // Series yang boleh memakai attestation ini
        bytes32 assetId; // id venue (lintas seri)
        uint8 verdict;
        uint8 aiRecommendation;
        uint16 score;
        bytes32 evidenceRoot;
        bytes32 rulesetHash;
        uint256 maxPrice; // rupiah per token
        uint16 maxShareBps; // batas persen seri ini
        uint16 maxTotalShareBps; // batas total persen lintas seri untuk asset
        uint64 expiry;
        bytes32 overrideReasonHash;
        uint256 nonce;
    }

    struct Record {
        bytes32 assetId;
        uint8 verdict;
        uint8 aiRecommendation;
        uint16 score;
        bytes32 evidenceRoot;
        bytes32 rulesetHash;
        uint256 maxPrice;
        uint16 maxShareBps;
        uint16 maxTotalShareBps;
        uint64 expiry;
        bool revoked;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(address series,bytes32 assetId,uint8 verdict,uint8 aiRecommendation,uint16 score,bytes32 evidenceRoot,bytes32 rulesetHash,uint256 maxPrice,uint16 maxShareBps,uint16 maxTotalShareBps,uint64 expiry,bytes32 overrideReasonHash,uint256 nonce)"
    );

    address[3] public signers;
    mapping(address => bool) public isSigner;

    mapping(address series => Record) private _records;
    mapping(address series => uint256) public nonces;
    mapping(address series => uint16) public lockedShareBps;
    mapping(bytes32 assetId => uint16) public totalShareBps;

    event Attested(address indexed series, bytes32 indexed assetId, uint8 verdict, uint16 score, uint256 maxPrice, uint64 expiry, uint256 nonce);
    event Revoked(address indexed series, address indexed by, bytes32 reasonHash);
    event ShareLocked(address indexed series, bytes32 indexed assetId, uint16 bps, uint16 totalBps);
    event ShareReleased(address indexed series, bytes32 indexed assetId, uint16 bps, uint16 totalBps);

    error NotSigner();
    error BadSigners();
    error BadVerdict();
    error Expired();
    error ExpiryTooFar();
    error BadNonce();
    error SignersNotAscending();
    error NotEnoughSignatures(uint256 have, uint256 need);
    error OverrideNeedsReason();
    error NotAttested();
    error NotValid();
    error ShareTooHigh();
    error TotalShareTooHigh();
    error AlreadyLocked();
    error BadParams();
    error IndependentRequired();

    constructor(address[3] memory _signers) EIP712("AssetAttestation", "1") {
        for (uint256 i = 0; i < 3; i++) {
            address s = _signers[i];
            if (s == address(0) || isSigner[s]) revert BadSigners();
            isSigner[s] = true;
            signers[i] = s;
        }
    }

    // ---------------------------------------------------------------- submit

    /// @param sigs tanda tangan; alamat penandatangan yang dipulihkan WAJIB terurut naik (tanpa duplikat).
    function submit(Attestation calldata a, bytes[] calldata sigs) external {
        if (a.verdict != PASS && a.verdict != FAIL) revert BadVerdict();
        if (a.aiRecommendation != PASS && a.aiRecommendation != FAIL) revert BadVerdict();
        if (a.expiry <= block.timestamp) revert Expired();
        if (a.expiry > block.timestamp + MAX_VALIDITY) revert ExpiryTooFar();
        if (a.nonce != nonces[a.series]) revert BadNonce();
        if (a.maxPrice == 0 || a.maxShareBps == 0 || a.maxShareBps > 10_000 || a.maxTotalShareBps > 10_000 || a.maxShareBps > a.maxTotalShareBps) {
            revert BadParams();
        }

        uint256 need = _required(a);
        if (sigs.length < need) revert NotEnoughSignatures(sigs.length, need);

        bytes32 digest = _hashTypedDataV4(_structHash(a));
        address last = address(0);
        bool sawIndependent;
        for (uint256 i = 0; i < sigs.length; i++) {
            address signer = ECDSA.recover(digest, sigs[i]);
            if (!isSigner[signer]) revert NotSigner();
            if (signer <= last) revert SignersNotAscending();
            last = signer;
            if (signer == signers[2]) sawIndependent = true;
        }
        // Persetujuan (PASS) wajib memuat pihak independen (signers[2]): dua anggota tim saja tidak cukup, supaya pihak luar
        // benar-benar punya hak setuju dan bukan sekadar hak veto. Veto (FAIL, 1 tanda tangan) tetap boleh oleh siapa pun.
        if (need >= 2 && !sawIndependent) revert IndependentRequired();

        nonces[a.series] = a.nonce + 1;
        _records[a.series] = Record({
            assetId: a.assetId,
            verdict: a.verdict,
            aiRecommendation: a.aiRecommendation,
            score: a.score,
            evidenceRoot: a.evidenceRoot,
            rulesetHash: a.rulesetHash,
            maxPrice: a.maxPrice,
            maxShareBps: a.maxShareBps,
            maxTotalShareBps: a.maxTotalShareBps,
            expiry: a.expiry,
            revoked: false
        });
        emit Attested(a.series, a.assetId, a.verdict, a.score, a.maxPrice, a.expiry, a.nonce);
    }

    function _required(Attestation calldata a) private pure returns (uint256) {
        if (a.verdict == FAIL) return 1; // veto mudah
        if (a.aiRecommendation == FAIL) {
            // membatalkan "tidak lolos" dari AI: semua penandatangan + hash alasan
            if (a.overrideReasonHash == bytes32(0)) revert OverrideNeedsReason();
            return 3;
        }
        return 2;
    }

    function _structHash(Attestation calldata a) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                a.series,
                a.assetId,
                a.verdict,
                a.aiRecommendation,
                a.score,
                a.evidenceRoot,
                a.rulesetHash,
                a.maxPrice,
                a.maxShareBps,
                a.maxTotalShareBps,
                a.expiry,
                a.overrideReasonHash,
                a.nonce
            )
        );
    }

    function hashAttestation(Attestation calldata a) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(a));
    }

    // ---------------------------------------------------------------- revoke

    /// @notice Veto mudah: satu penandatangan cukup untuk mencabut.
    function revoke(address series, bytes32 reasonHash) external {
        if (!isSigner[msg.sender]) revert NotSigner();
        Record storage r = _records[series];
        if (r.verdict == 0) revert NotAttested();
        r.revoked = true;
        emit Revoked(series, msg.sender, reasonHash);
    }

    // ---------------------------------------------------------------- views

    function isValid(address series) public view returns (bool) {
        Record storage r = _records[series];
        return r.verdict == PASS && !r.revoked && r.expiry > block.timestamp;
    }

    function maxPrice(address series) external view returns (uint256) {
        return _records[series].maxPrice;
    }

    function maxShareBps(address series) external view returns (uint16) {
        return _records[series].maxShareBps;
    }

    function getRecord(address series) external view returns (Record memory) {
        return _records[series];
    }

    // ---------------------------------------------------------------- share cap lintas seri

    /// @notice Dipanggil Series saat membuka penawaran. Menjaga total persen lintas seri per asset.
    function lockShare(uint16 shareBps) external {
        Record storage r = _records[msg.sender];
        if (!isValid(msg.sender)) revert NotValid();
        if (lockedShareBps[msg.sender] != 0) revert AlreadyLocked();
        if (shareBps == 0 || shareBps > r.maxShareBps) revert ShareTooHigh();
        uint16 total = totalShareBps[r.assetId] + shareBps;
        if (total > r.maxTotalShareBps) revert TotalShareTooHigh();
        totalShareBps[r.assetId] = total;
        lockedShareBps[msg.sender] = shareBps;
        emit ShareLocked(msg.sender, r.assetId, shareBps, total);
    }

    /// @notice Dipanggil Series saat ditutup/gagal supaya kuota persen bebas lagi.
    function releaseShare() external {
        uint16 bps = lockedShareBps[msg.sender];
        if (bps == 0) return;
        bytes32 assetId = _records[msg.sender].assetId;
        lockedShareBps[msg.sender] = 0;
        totalShareBps[assetId] -= bps;
        emit ShareReleased(msg.sender, assetId, bps, totalShareBps[assetId]);
    }
}
