// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title AttestationRegistry
/// @notice EIP-712 2-of-3 attestations for decisions the platform cannot make alone.
///         Three slots: PLATFORM (Open Grounds), COUNTERPARTY (venue owner, per series), VERIFIER (independent reviewer).
///         Signer pairs are enforced HERE, not in the series, so a series cannot loosen them:
///           ACQUISITION_CLOSED (asset verified, tokens may issue): PLATFORM + COUNTERPARTY
///           REVENUE_PERIOD (monthly waterfall figures)           : PLATFORM + COUNTERPARTY
///             if the owner is silent past the deadline           : PLATFORM + VERIFIER also valid
///           VALUATION_UPDATE (new reference price)               : PLATFORM + VERIFIER
///         The platform side can never act alone: it always needs one signature from another slot.
///         Buys and sell-backs do not go through here: investors sign their own orders (see VenueSeries).
contract AttestationRegistry is EIP712, AccessControl {
    enum Kind {
        ACQUISITION_CLOSED,
        REVENUE_PERIOD,
        VALUATION_UPDATE
    }

    uint8 public constant SLOT_PLATFORM = 1;
    uint8 public constant SLOT_COUNTERPARTY = 2;
    uint8 public constant SLOT_VERIFIER = 4;
    uint64 public constant ROTATION_DELAY = 1 days;

    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint8 kind,uint256 seriesId,uint256 refId,bytes32 payloadHash,uint64 deadline)");

    address public platform;
    address public verifier;
    /// @notice Owner (counterparty) per series contract. Only registered series may use attestations.
    mapping(address series => address) public counterpartyOf;
    mapping(address series => bool) public isSeries;
    /// @notice (kind, series, refId) already used: anti-replay.
    mapping(bytes32 key => bool) public used;

    struct PendingSigners {
        address platform;
        address verifier;
        uint64 readyAt;
    }

    PendingSigners public pending;

    event SeriesRegistered(address indexed series, address indexed counterparty);
    event CounterpartyChanged(address indexed series, address indexed counterparty);
    event SignersProposed(address platform, address verifier, uint64 readyAt);
    event SignersRotated(address platform, address verifier);
    event Attested(Kind indexed kind, address indexed series, uint256 indexed refId, bytes32 payloadHash, uint8 slots);

    error NotRegisteredSeries();
    error ZeroAddress();
    error DuplicateAddress();
    error Expired();
    error AlreadyUsed();
    error UnknownSigner();
    error SlotNotAllowed(uint8 slot);
    error DuplicateSlot(uint8 slot);
    error NotEnoughSignatures();
    error PlatformRequired();
    error RotationNotReady();
    error NoPendingRotation();

    constructor(address admin, address platform_, address verifier_) EIP712("OpenGroundsAttestation", "1") {
        if (admin == address(0) || platform_ == address(0) || verifier_ == address(0)) revert ZeroAddress();
        if (platform_ == verifier_) revert DuplicateAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        platform = platform_;
        verifier = verifier_;
        emit SignersRotated(platform_, verifier_);
    }

    // ------------------------------------------------------------------ admin

    /// @notice Register a series contract with its owner (COUNTERPARTY slot).
    function registerSeries(address series, address counterparty) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (series == address(0) || counterparty == address(0)) revert ZeroAddress();
        if (counterparty == platform || counterparty == verifier) revert DuplicateAddress();
        isSeries[series] = true;
        counterpartyOf[series] = counterparty;
        emit SeriesRegistered(series, counterparty);
    }

    function setCounterparty(address series, address counterparty) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isSeries[series]) revert NotRegisteredSeries();
        if (counterparty == address(0)) revert ZeroAddress();
        if (counterparty == platform || counterparty == verifier) revert DuplicateAddress();
        counterpartyOf[series] = counterparty;
        emit CounterpartyChanged(series, counterparty);
    }

    /// @notice Rotate signers with a time delay and a public event (PRD §6.5).
    function proposeSigners(address platform_, address verifier_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (platform_ == address(0) || verifier_ == address(0)) revert ZeroAddress();
        if (platform_ == verifier_) revert DuplicateAddress();
        uint64 readyAt = uint64(block.timestamp) + ROTATION_DELAY;
        pending = PendingSigners(platform_, verifier_, readyAt);
        emit SignersProposed(platform_, verifier_, readyAt);
    }

    function applySigners() external onlyRole(DEFAULT_ADMIN_ROLE) {
        PendingSigners memory p = pending;
        if (p.readyAt == 0) revert NoPendingRotation();
        if (block.timestamp < p.readyAt) revert RotationNotReady();
        platform = p.platform;
        verifier = p.verifier;
        delete pending;
        emit SignersRotated(p.platform, p.verifier);
    }

    // ------------------------------------------------------------------ verification

    function digest(Kind kind, address series, uint256 refId, bytes32 payloadHash, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(ATTESTATION_TYPEHASH, uint8(kind), uint256(uint160(series)), refId, payloadHash, deadline)
            )
        );
    }

    /// @notice Slots allowed to sign a given kind. `ownerSilent` only affects REVENUE_PERIOD.
    function allowedSlots(Kind kind, bool ownerSilent) public pure returns (uint8) {
        if (kind == Kind.ACQUISITION_CLOSED) return SLOT_PLATFORM | SLOT_COUNTERPARTY;
        if (kind == Kind.REVENUE_PERIOD) {
            return
                ownerSilent ? (SLOT_PLATFORM | SLOT_COUNTERPARTY | SLOT_VERIFIER) : (SLOT_PLATFORM | SLOT_COUNTERPARTY);
        }
        return SLOT_PLATFORM | SLOT_VERIFIER; // VALUATION_UPDATE
    }

    function slotOf(address series, address signer) public view returns (uint8) {
        if (signer == platform) return SLOT_PLATFORM;
        if (signer == verifier) return SLOT_VERIFIER;
        if (signer != address(0) && signer == counterpartyOf[series]) return SLOT_COUNTERPARTY;
        return 0;
    }

    /// @notice Called by the series contract. Verifies signatures, marks (kind, series, refId) used, then emits an event.
    /// @dev The series signer is msg.sender, so an attestation for another series cannot be reused here.
    function verify(
        Kind kind,
        uint256 refId,
        bytes32 payloadHash,
        uint64 deadline,
        bool ownerSilent,
        bytes[] calldata sigs
    ) external returns (uint8 slots) {
        address series = msg.sender;
        if (!isSeries[series]) revert NotRegisteredSeries();
        if (block.timestamp > deadline) revert Expired();
        bytes32 key = keccak256(abi.encode(kind, series, refId));
        if (used[key]) revert AlreadyUsed();

        uint8 allowed = allowedSlots(kind, ownerSilent);
        bytes32 d = digest(kind, series, refId, payloadHash, deadline);
        uint256 count;
        for (uint256 i = 0; i < sigs.length; i++) {
            uint8 slot = slotOf(series, ECDSA.recover(d, sigs[i]));
            if (slot == 0) revert UnknownSigner();
            if (slot & allowed == 0) revert SlotNotAllowed(slot);
            if (slots & slot != 0) revert DuplicateSlot(slot);
            slots |= slot;
            count++;
        }
        if (count < 2) revert NotEnoughSignatures();
        if (slots & SLOT_PLATFORM == 0) revert PlatformRequired();

        used[key] = true;
        emit Attested(kind, series, refId, payloadHash, slots);
    }
}
