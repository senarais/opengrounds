// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IAssetAttestation} from "./interfaces/IAssetAttestation.sol";
import {SeriesToken} from "./SeriesToken.sol";

/// @title Series
/// @notice Satu seri penawaran bagi hasil omzet: penawaran (Cara 1: minimum raise), catatan escrow & rilis bertahap,
///         angka kantong investor (P, R, S), antrian redeem, anchor root harian, penutupan.
/// @dev Mode A: rupiah & kustodian disimulasikan OFF-chain. Kontrak hanya menyimpan state dan pemicu; operator
///      (platform) memanggil fungsi setelah kustodian mengonfirmasi. Akuntansi kantong memakai variabel internal
///      (P, R, S), BUKAN balanceOf. Semua uang = integer rupiah.
///
///      Status on-chain: Draft -> Offering -> Funded | Failed -> Active -> Closed.
///      "Verifying" dan "Attested" hidup di platform (off-chain); on-chain Attested = attestation valid di registry.
///
///      Admin: DEFAULT_ADMIN_ROLE (deployer) hanya bisa mengelola role OPERATOR dan pause. Tidak ada upgrade.
contract Series is AccessControl, ReentrancyGuard, Pausable, EIP712 {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint16 public constant TRANCHE1_BPS = 5_000; // tahap 1 = 50% dari dana terkumpul

    enum State {
        Draft,
        Offering,
        Funded,
        Failed,
        Active,
        Closed
    }

    enum RedeemStatus {
        None,
        Pending,
        Approved,
        Paid,
        Failed,
        Cancelled
    }

    struct Terms {
        uint256 target; // rupiah
        uint256 minRaise; // rupiah (tidak termasuk pembelian pihak terkait)
        uint256 unitPrice; // rupiah per token
        uint16 shareBps; // 1000 = 10% dari Eligible Revenue
        uint32 tenorDays;
        uint32 offeringDuration; // detik
    }

    struct RedeemRequest {
        address holder;
        uint128 units;
        uint128 payout;
        RedeemStatus status;
    }

    bytes32 private constant REDEEM_TYPEHASH =
        keccak256("RedeemRequest(address series,address holder,uint256 units,uint256 nonce,uint256 deadline)");
    bytes32 private constant TRANSFER_TYPEHASH =
        keccak256("TransferRequest(address series,address from,address to,uint256 units,uint256 nonce,uint256 deadline)");
    bytes32 private constant ROOT_TYPEHASH = keccak256("DailyRoot(address series,uint32 day,bytes32 root,uint32 count)");

    // ---- immutables
    IAssetAttestation public immutable attestation;
    SeriesToken public immutable token;
    address public immutable auditor; // pihak independen yang co-sign root harian & menandai exception
    uint256 public immutable target;
    uint256 public immutable minRaise;
    uint256 public immutable unitPrice;
    uint256 public immutable cap; // suplai maksimum = target / unitPrice
    uint16 public immutable shareBps;
    uint32 public immutable tenorDays;
    uint32 public immutable offeringDuration;

    // ---- state penawaran
    State public state;
    uint64 public offeringEnd;
    uint64 public tenorEnd;
    uint256 public raised; // total dana masuk escrow (semua pembeli)
    uint256 public countedRaise; // untuk uji minRaise (tanpa pihak terkait)
    uint256 public minted; // total token yang pernah di-mint (terkunci saat penawaran ditutup)
    uint256 public refunded;
    mapping(bytes32 => bool) public paymentRefUsed;

    // ---- rilis escrow (catatan; uang riil di kustodian)
    bool public tranche1Released;
    bool public tranche2Released;
    uint256 public released;

    // ---- kantong investor
    uint256 public P; // total masuk kantong (final, hanya naik)
    uint256 public R; // total sudah/akan dibayar
    uint256 public S; // suplai untuk akuntansi (tidak termasuk token yang redeem-nya sudah disetujui)
    uint64 public lastPeriod;
    mapping(uint64 => bool) public periodClean;
    bool public exceptionOpen;

    // ---- redeem
    uint256 public nextRedeemId;
    uint256 public redeemHead;
    mapping(uint256 => RedeemRequest) public redeems;
    mapping(address => uint256) public pendingUnits; // token yang terkunci karena request redeem
    mapping(address => uint256) public redeemNonce;
    mapping(address => uint256) public transferNonce;
    uint256 public paidOut;

    // ---- anchor
    mapping(uint32 => bytes32) public dailyRoot;

    event Opened(uint64 offeringEnd);
    event Purchased(address indexed buyer, uint256 units, uint256 amount, bytes32 indexed paymentRef, bool relatedParty);
    event OfferingClosed(State result, uint256 minted, uint256 countedRaise);
    event RefundOwed(address indexed holder, uint256 units, uint256 amount);
    event EscrowReleased(uint8 tranche, uint256 amount);
    event PoolPosted(uint64 indexed periodId, uint256 amount, bytes32 reportHash, uint256 P);
    event PeriodReconciled(uint64 indexed periodId, bool clean, bytes32 reportHash);
    event ExceptionFlagged(bool open);
    event RootAnchored(uint32 indexed day, bytes32 root, uint32 count);
    event RedeemRequested(uint256 indexed id, address indexed holder, uint256 units);
    event RedeemApproved(uint256 indexed id, address indexed holder, uint256 units, uint256 payout);
    event RedeemPaid(uint256 indexed id, address indexed holder, uint256 units, uint256 payout);
    event RedeemFailed(uint256 indexed id);
    event RedeemCancelled(uint256 indexed id);
    event SeriesClosed(string reason);
    event TokensMoved(address indexed from, address indexed to, uint256 units);

    error WrongState(State have);
    error BadTerms();
    error NoValidAttestation();
    error PriceAboveMax();
    error OfferingEnded();
    error OfferingNotEnded();
    error ZeroUnits();
    error CapExceeded();
    error PaymentRefReused();
    error NotFunded();
    error AlreadyReleased();
    error Tranche1First();
    error PeriodNotClean();
    error ExceptionIsOpen();
    error NotAuditor();
    error BadPeriod();
    error NoSupply();
    error TenorEnded();
    error TenorNotEnded();
    error NothingToRefund();
    error InsufficientBalance();
    error NotRequester();
    error BadSignature();
    error SignatureExpired();
    error NotPending();
    error NotApproved();
    error NotHead();
    error ZeroPayout();
    error RedeemClosed();
    error RootAlreadyAnchored();
    error TransferNotOpen();
    error SelfTransfer();

    modifier inState(State s) {
        if (state != s) revert WrongState(state);
        _;
    }

    constructor(
        address admin,
        address operator,
        address auditor_,
        IAssetAttestation attestation_,
        string memory name_,
        string memory symbol_,
        Terms memory t
    ) EIP712("Series", "1") {
        if (
            t.unitPrice == 0 || t.target < t.unitPrice || t.minRaise == 0 || t.minRaise > t.target || t.shareBps == 0
                || t.shareBps > 10_000 || t.tenorDays < 30 || t.offeringDuration == 0 || auditor_ == address(0)
                || address(attestation_) == address(0)
        ) revert BadTerms();
        uint256 cap_ = t.target / t.unitPrice;
        if (t.minRaise > cap_ * t.unitPrice) revert BadTerms(); // minRaise harus bisa dicapai

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        auditor = auditor_;
        attestation = attestation_;
        target = t.target;
        minRaise = t.minRaise;
        unitPrice = t.unitPrice;
        cap = cap_;
        shareBps = t.shareBps;
        tenorDays = t.tenorDays;
        offeringDuration = t.offeringDuration;
        token = new SeriesToken(name_, symbol_, address(this));
    }

    // ================================================================ penawaran

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Hasil KYC (vendor off-chain): hanya alamat allowlist yang boleh menerima token.
    function setKyc(address account, bool ok) external onlyRole(OPERATOR_ROLE) {
        token.setAllowed(account, ok);
    }

    /// @notice Buka penawaran. Ditolak tanpa attestation valid atau bila harga > maxPrice attestation.
    function openOffering() external onlyRole(OPERATOR_ROLE) whenNotPaused inState(State.Draft) {
        if (!attestation.isValid(address(this))) revert NoValidAttestation();
        if (unitPrice > attestation.maxPrice(address(this))) revert PriceAboveMax();
        attestation.lockShare(shareBps); // revert bila melebihi batas seri / total lintas seri
        state = State.Offering;
        offeringEnd = uint64(block.timestamp) + offeringDuration;
        emit Opened(offeringEnd);
    }

    /// @notice Catat pembelian setelah kustodian mengonfirmasi dana masuk escrow, lalu mint ke wallet pembeli.
    function recordPurchase(address buyer, uint256 units, bytes32 paymentRef, bool relatedParty)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
        inState(State.Offering)
    {
        if (block.timestamp > offeringEnd) revert OfferingEnded();
        if (!attestation.isValid(address(this))) revert NoValidAttestation(); // tidak ada mint tanpa attestation valid
        if (units == 0) revert ZeroUnits();
        if (minted + units > cap) revert CapExceeded();
        if (paymentRefUsed[paymentRef]) revert PaymentRefReused();
        paymentRefUsed[paymentRef] = true;

        uint256 amount = units * unitPrice;
        raised += amount;
        if (!relatedParty) countedRaise += amount;
        minted += units;
        token.mint(buyer, units);
        emit Purchased(buyer, units, amount, paymentRef, relatedParty);
    }

    /// @notice Tutup penawaran: bisa dipanggil siapa pun bila waktu habis, terjual habis, atau attestation tidak lagi valid.
    function closeOffering() external nonReentrant inState(State.Offering) {
        bool done = block.timestamp > offeringEnd || minted == cap || !attestation.isValid(address(this));
        if (!done) revert OfferingNotEnded();

        if (countedRaise >= minRaise) {
            state = State.Funded;
            tenorEnd = uint64(block.timestamp) + uint64(tenorDays) * 1 days;
            S = minted; // suplai terkunci: tidak ada mint lagi di luar Offering
        } else {
            state = State.Failed; // Cara 1: gagal = refund penuh
            attestation.releaseShare();
        }
        emit OfferingClosed(state, minted, countedRaise);
    }

    /// @notice Refund penuh saat Failed: token dibakar, event memicu kustodian membayar kembali.
    function refund(address holder) external nonReentrant inState(State.Failed) {
        uint256 units = token.balanceOf(holder);
        if (units == 0) revert NothingToRefund();
        uint256 amount = units * unitPrice;
        refunded += amount;
        token.burn(holder, units);
        emit RefundOwed(holder, units, amount);
    }

    // ================================================================ rilis escrow

    /// @notice Tahap 1 (~50%) saat target (minRaise) tercapai dan attestation masih valid.
    function releaseTranche1() external onlyRole(OPERATOR_ROLE) whenNotPaused inState(State.Funded) {
        if (!attestation.isValid(address(this))) revert NoValidAttestation();
        uint256 amount = (raised * TRANCHE1_BPS) / 10_000;
        tranche1Released = true;
        released += amount;
        state = State.Active;
        emit EscrowReleased(1, amount);
    }

    /// @notice Tahap 2 setelah periode pertama terekonsiliasi bersih, tanpa exception terbuka, attestation valid.
    function releaseTranche2() external onlyRole(OPERATOR_ROLE) whenNotPaused inState(State.Active) {
        if (!tranche1Released) revert Tranche1First();
        if (tranche2Released) revert AlreadyReleased();
        if (!attestation.isValid(address(this))) revert NoValidAttestation();
        if (!periodClean[1]) revert PeriodNotClean();
        if (exceptionOpen) revert ExceptionIsOpen();
        uint256 amount = raised - (raised * TRANCHE1_BPS) / 10_000;
        tranche2Released = true;
        released += amount;
        emit EscrowReleased(2, amount);
    }

    // ================================================================ kantong investor

    /// @notice Posting angka FINAL satu periode (setelah settlement PSP + jendela refund). P hanya naik.
    ///         Seri Closed atau tanpa suplai tidak bisa menerima split.
    function postPool(uint64 periodId, uint256 amount, bytes32 reportHash)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
    {
        if (state != State.Funded && state != State.Active) revert WrongState(state);
        if (S == 0) revert NoSupply();
        if (block.timestamp > tenorEnd) revert TenorEnded();
        if (periodId != lastPeriod + 1) revert BadPeriod();
        lastPeriod = periodId;
        P += amount;
        emit PoolPosted(periodId, amount, reportHash, P);
    }

    function reconcilePeriod(uint64 periodId, bool clean, bytes32 reportHash) external onlyRole(OPERATOR_ROLE) {
        if (periodId == 0 || periodId > lastPeriod) revert BadPeriod();
        periodClean[periodId] = clean;
        emit PeriodReconciled(periodId, clean, reportHash);
    }

    /// @notice Auditor menandai/menghapus exception: selama terbuka, tahap 2 tertahan.
    function setException(bool open_) external {
        if (msg.sender != auditor) revert NotAuditor();
        exceptionOpen = open_;
        emit ExceptionFlagged(open_);
    }

    /// @notice Anchor Merkle root harian POS, ditandatangani (EIP-712) oleh pihak independen.
    ///         Bukti tidak diubah, bukan bukti benar.
    function anchorRoot(uint32 day, bytes32 root, uint32 count, bytes calldata auditorSig)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (state == State.Draft) revert WrongState(state);
        if (dailyRoot[day] != bytes32(0)) revert RootAlreadyAnchored();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ROOT_TYPEHASH, address(this), day, root, count)));
        if (ECDSA.recover(digest, auditorSig) != auditor) revert BadSignature();
        dailyRoot[day] = root;
        emit RootAnchored(day, root, count);
    }

    // ================================================================ redeem

    /// @notice Nilai tebus per token (dibulatkan ke bawah). Mulai ~0 dan naik seiring P.
    function redeemValuePerToken() external view returns (uint256) {
        return S == 0 ? 0 : (P - R) / S;
    }

    function poolBalance() external view returns (uint256) {
        return P - R;
    }

    function quoteRedeem(uint256 units) public view returns (uint256) {
        if (S == 0) return 0;
        return (units * (P - R)) / S;
    }

    function _redeemOpen() private view returns (bool) {
        return state == State.Funded || state == State.Active || (state == State.Closed && S > 0);
    }

    /// @notice Holder mengajukan redeem (sebagian boleh): token terkunci sampai dibayar/dibatalkan.
    function requestRedeem(uint256 units) external nonReentrant returns (uint256) {
        return _request(msg.sender, units);
    }

    /// @notice Redeem tanpa gas untuk holder: permintaan ditandatangani holder (EIP-712), diteruskan operator.
    function requestRedeemFor(address holder, uint256 units, uint256 deadline, bytes calldata sig)
        external
        onlyRole(OPERATOR_ROLE)
        nonReentrant
        returns (uint256)
    {
        if (block.timestamp > deadline) revert SignatureExpired();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(REDEEM_TYPEHASH, address(this), holder, units, redeemNonce[holder]++, deadline))
        );
        if (ECDSA.recover(digest, sig) != holder) revert BadSignature();
        return _request(holder, units);
    }

    /// @notice Kirim token ke pemegang ber-KYC lain tanpa gas bagi pengirim: pengirim menandatangani (EIP-712), operator meneruskan.
    ///         Hanya saat Funded/Active (setelah penawaran sukses; tidak mengganggu refund). Token yang terkunci untuk redeem tidak bisa dikirim.
    ///         Akuntansi kantong (P, R, S) tidak berubah: yang berpindah hanya hak atas nilai tebus per token.
    function transferFor(address from, address to, uint256 units, uint256 deadline, bytes calldata sig)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (state != State.Funded && state != State.Active) revert TransferNotOpen();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (units == 0) revert ZeroUnits();
        if (from == to) revert SelfTransfer();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(TRANSFER_TYPEHASH, address(this), from, to, units, transferNonce[from]++, deadline))
        );
        if (ECDSA.recover(digest, sig) != from) revert BadSignature();
        if (units + pendingUnits[from] > token.balanceOf(from)) revert InsufficientBalance();
        token.move(from, to, units);
        emit TokensMoved(from, to, units);
    }

    function _request(address holder, uint256 units) private returns (uint256 id) {
        if (!_redeemOpen()) revert RedeemClosed();
        if (units == 0) revert ZeroUnits();
        if (units + pendingUnits[holder] > token.balanceOf(holder)) revert InsufficientBalance();
        pendingUnits[holder] += units;
        id = ++nextRedeemId;
        if (redeemHead == 0) redeemHead = 1;
        redeems[id] = RedeemRequest({holder: holder, units: uint128(units), payout: 0, status: RedeemStatus.Pending});
        emit RedeemRequested(id, holder, units);
    }

    function cancelRedeem(uint256 id) external {
        RedeemRequest storage r = redeems[id];
        if (r.status != RedeemStatus.Pending) revert NotPending();
        if (msg.sender != r.holder && !hasRole(OPERATOR_ROLE, msg.sender)) revert NotRequester();
        r.status = RedeemStatus.Cancelled;
        pendingUnits[r.holder] -= r.units;
        emit RedeemCancelled(id);
    }

    /// @notice Kustodian punya kas: kunci angka bayar & kurangi suplai akuntansi. FIFO (antrian).
    function approveRedeem(uint256 id) external onlyRole(OPERATOR_ROLE) nonReentrant {
        if (!_redeemOpen()) revert RedeemClosed();
        // maju melewati request yang sudah tidak Pending
        while (redeemHead <= nextRedeemId && redeems[redeemHead].status != RedeemStatus.Pending) redeemHead++;
        if (id != redeemHead) revert NotHead();

        RedeemRequest storage r = redeems[id];
        uint256 units = r.units;
        if (units > S) revert NoSupply();
        uint256 payout = (units * (P - R)) / S; // bulatkan ke bawah untuk investor
        if (payout == 0) revert ZeroPayout();
        R += payout;
        S -= units;
        r.payout = uint128(payout);
        r.status = RedeemStatus.Approved;
        emit RedeemApproved(id, r.holder, units, payout);
    }

    /// @notice Kustodian sudah membayar rupiah: token dibakar. Semua token habis => seri Closed.
    function confirmRedeem(uint256 id) external onlyRole(OPERATOR_ROLE) nonReentrant {
        RedeemRequest storage r = redeems[id];
        if (r.status != RedeemStatus.Approved) revert NotApproved();
        r.status = RedeemStatus.Paid;
        pendingUnits[r.holder] -= r.units;
        paidOut += r.payout;
        token.burn(r.holder, r.units);
        emit RedeemPaid(id, r.holder, r.units, r.payout);

        if (token.totalSupply() == 0 && state != State.Closed) {
            state = State.Closed; // split dimatikan (tidak ada pembagian dengan nol)
            attestation.releaseShare();
            emit SeriesClosed("all tokens redeemed");
        }
    }

    /// @notice Pembayaran kustodian gagal: buka kunci, kembalikan angka kantong.
    function failRedeem(uint256 id) external onlyRole(OPERATOR_ROLE) nonReentrant {
        RedeemRequest storage r = redeems[id];
        if (r.status != RedeemStatus.Approved) revert NotApproved();
        r.status = RedeemStatus.Failed;
        R -= r.payout;
        S += r.units;
        pendingUnits[r.holder] -= r.units;
        emit RedeemFailed(id);
    }

    // ================================================================ penutupan

    /// @notice Tenor habis: seri Closed, split mati. Sisa kantong dibagi ke token yang tersisa lewat redeem.
    function endTenor() external nonReentrant {
        if (state != State.Funded && state != State.Active) revert WrongState(state);
        if (block.timestamp < tenorEnd) revert TenorNotEnded();
        state = State.Closed;
        attestation.releaseShare();
        emit SeriesClosed("tenor ended");
    }
}
