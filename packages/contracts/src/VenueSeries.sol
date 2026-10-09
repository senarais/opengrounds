// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";
import {SeriesToken} from "./SeriesToken.sol";

/// @title VenueSeries
/// @notice Satu seri hak manfaat ekonomi atas X% laba bersih yang bisa dibagikan dari satu venue (PRD v4.1).
///         Chain berfungsi sebagai wasit:
///           - token hanya terbit setelah verifikasi aset 2-of-3 (ACQUISITION_CLOSED);
///           - token hanya berpindah ke/dari investor yang MENANDATANGANI pesanannya sendiri (EIP-712, lewat Privy),
///             dengan nominal yang wajib sama dengan harga referensi;
///           - waterfall dan jatah per token dihitung kode dari angka yang disetujui platform + owner;
///           - kewajiban tercatat, dan status Overdue/Defaulted bisa dipicu siapa pun.
///         Rupiah tidak pernah lewat sini.
/// @dev Tidak ada proxy, tidak ada burn. Supply dicetak sekali ke treasury Grounds saat ACQUISITION_CLOSED.
///      Akumulator jatah: `accPerTokenE18` (rupiah × 1e18 per token); setiap perubahan saldo menyelesaikan jatah pihak terkait dulu.
contract VenueSeries is AccessControl, ReentrancyGuard, EIP712 {
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");
    bytes32 public constant ORDER_TYPEHASH =
        keccak256("Order(address investor,uint256 tokens,uint256 paidIdr,uint256 orderId,uint64 deadline)");
    bytes32 public constant SELLBACK_TYPEHASH =
        keccak256("SellBack(address holder,uint256 tokens,uint256 paidIdr,uint256 requestId,uint64 deadline)");

    /// @notice Pesanan beli yang ditandatangani investor sebelum membayar. Platform mengeksekusinya setelah rupiah masuk.
    struct Order {
        address investor;
        uint256 tokens;
        uint256 paidIdr;
        uint256 orderId;
        uint64 deadline;
    }

    /// @notice Permintaan jual balik yang ditandatangani pemegang.
    struct SellBack {
        address holder;
        uint256 tokens;
        uint256 paidIdr;
        uint256 requestId;
        uint64 deadline;
    }

    enum State {
        Draft,
        Verified,
        Active,
        Disputed,
        Overdue,
        Defaulted,
        Liquidating,
        Closed
    }

    struct Params {
        uint16 stakeBps; // X: porsi hak ekonomi yang dibeli SPV
        uint16 spvFeeBps; // m: biaya manajemen SPV dari P_SPV
        uint16 maxOpexBps; // plafon biaya operasional terhadap gross
        uint16 sellbackDiscountBps; // d: diskon jual balik
        uint16 maxHoldingBps; // batas kepemilikan per investor terhadap supply (10000 = tanpa batas)
        uint32 lockPeriod; // masa kunci per lot (detik)
        uint32 payoutWindow; // tenggat dana jatah tersedia setelah periode diposting (detik)
        uint32 defaultGrace; // masa toleransi Overdue sebelum Defaulted (detik)
        uint32 ownerSignWindow; // setelah akhir periode + jendela ini, REVENUE_PERIOD boleh PLATFORM + VERIFIER
    }

    struct Waterfall {
        uint256 gross;
        uint256 refunds;
        uint256 opex;
        uint256 tax;
        uint256 operatorFee;
        uint256 reserve;
        uint256 platformFee;
    }

    struct Period {
        uint64 periodEnd;
        uint64 payoutDue;
        uint256 distributable; // D
        uint256 poolInvestors; // P_inv
        uint256 deltaE18; // kenaikan akumulator per token
        uint256 owedIdr; // kewajiban ke pemegang token di luar treasury
        uint256 minSettleIdr; // owed dikurangi kelonggaran pembulatan (1 rupiah per pemegang)
        uint256 paidIdr; // dana yang ter-attest sudah dikreditkan
        uint32 payoutCount; // berapa kali pembayaran jatah dicatat untuk periode ini (boleh bertahap)
        bool settled;
        bool overdue;
        bytes32 evidenceHash;
        bytes32 payoutRoot;
    }

    AttestationRegistry public immutable registry;
    SeriesToken public immutable token;
    address public immutable treasury;

    Params public params;
    State public state;
    uint256 public supply;
    uint256 public valuationIdr;
    uint256 public refPriceIdr;
    uint256 public valuationNonce;

    uint256 public accPerTokenE18;
    uint256 public dustE18;
    mapping(address => uint256) public accruedIdr; // jatah yang sudah diselesaikan per pemegang (kumulatif)
    mapping(address => uint256) public lastAccE18;

    uint256 public lastPeriodId;
    mapping(uint256 => Period) public periods;
    uint256 public overduePeriods;
    uint256 public holderCount; // pemegang di luar treasury dengan saldo > 0

    mapping(bytes32 => bool) public disputed;
    uint256 public openDisputes;
    mapping(uint256 => bool) public orderUsed;
    mapping(uint256 => bool) public sellBackUsed;

    event SeriesVerified(bytes32 kybEvidenceHash);
    event SeriesActivated(uint256 valuationIdr, uint256 supply, uint256 refPriceIdr, bytes32 evidenceHash);
    event Allocated(uint256 indexed orderId, address indexed investor, uint256 tokens, uint256 paidIdr, uint64 unlockAt, bytes32 paymentEvidence);
    event PeriodPosted(uint256 indexed periodId, uint256 distributable, uint256 poolInvestors, uint256 owedIdr, uint64 payoutDue, bytes32 evidenceHash);
    event PayoutSettled(uint256 indexed periodId, uint256 paidIdr, uint256 totalPaidIdr, bytes32 payoutRoot, bool settled);
    event SellBackExecuted(uint256 indexed requestId, address indexed holder, uint256 tokens, uint256 paidIdr, bytes32 paymentEvidence);
    event ValuationUpdated(uint256 indexed nonce, uint256 valuationIdr, uint256 refPriceIdr, bytes32 evidenceHash);
    event Overdue(uint256 indexed periodId);
    event Defaulted(uint256 indexed periodId);
    event Restored();
    event DisputeRaised(bytes32 indexed itemRef, bytes32 reasonHash, address by);
    event DisputeResolved(bytes32 indexed itemRef, bytes32 reasonHash, address by);
    event ForcedTransfer(address indexed from, address indexed to, uint256 tokens, bytes32 reasonCode);
    event Frozen(address indexed account, bool frozen);
    event VerifiedHolder(address indexed account, bool verified);
    event LiquidationStarted(bytes32 evidenceHash);
    event SeriesClosed();

    error WrongState(State state);
    error BadParams();
    error BadPrice();
    error BadPeriod();
    error DeductionsExceedGross();
    error OpexAboveCap();
    error ItemDisputed();
    error OrderUsed();
    error LengthMismatch();
    error BadInvestorSignature();
    error OrderExpired();
    error NotVerified(address account);
    error IsFrozen(address account);
    error InsufficientTreasury();
    error HoldingCapExceeded(address account);
    error ExceedsOwed();
    error NotOverdueYet();
    error NothingOwed();
    error NotAttestor();
    error NotDisputed();
    error AlreadyDisputed();
    error UnsettledPeriods();

    constructor(
        address admin,
        address controller,
        AttestationRegistry registry_,
        address treasury_,
        string memory name_,
        string memory symbol_,
        Params memory p
    ) EIP712("OpenGroundsSeries", "1") {
        if (p.stakeBps == 0 || p.stakeBps > 10_000 || p.spvFeeBps > 10_000 || p.maxOpexBps > 10_000) revert BadParams();
        if (p.sellbackDiscountBps > 10_000 || p.maxHoldingBps == 0 || p.maxHoldingBps > 10_000) revert BadParams();
        if (address(registry_) == address(0) || treasury_ == address(0) || admin == address(0)) revert BadParams();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONTROLLER_ROLE, controller);
        registry = registry_;
        treasury = treasury_;
        params = p;
        token = new SeriesToken(name_, symbol_, address(this));
    }

    modifier inState(State s) {
        if (state != s) revert WrongState(state);
        _;
    }

    // ------------------------------------------------------------------ siklus awal

    /// @notice KYB dan valuasi sudah disetujui manusia (di luar chain); jejaknya di-hash.
    function markVerified(bytes32 kybEvidenceHash) external onlyRole(DEFAULT_ADMIN_ROLE) inState(State.Draft) {
        state = State.Verified;
        emit SeriesVerified(kybEvidenceHash);
    }

    /// @notice ACQUISITION_CLOSED (PLATFORM + COUNTERPARTY): owner menyatakan dana diterima dan hak dialihkan.
    ///         Supply dicetak sekali ke treasury. `refPrice × supply` harus sama persis dengan `valuasi × X`.
    function activate(uint256 valuationIdr_, uint256 supply_, uint256 refPriceIdr_, bytes32 evidenceHash, uint64 deadline, bytes[] calldata sigs)
        external
        nonReentrant
        inState(State.Verified)
    {
        if (supply_ == 0 || refPriceIdr_ == 0) revert BadParams();
        if (refPriceIdr_ * supply_ * 10_000 != valuationIdr_ * params.stakeBps) revert BadPrice();
        bytes32 payload = keccak256(abi.encode(valuationIdr_, supply_, refPriceIdr_, params.stakeBps, params.spvFeeBps, evidenceHash));
        registry.verify(AttestationRegistry.Kind.ACQUISITION_CLOSED, 0, payload, deadline, false, sigs);
        valuationIdr = valuationIdr_;
        supply = supply_;
        refPriceIdr = refPriceIdr_;
        state = State.Active;
        token.mintSupply(treasury, supply_);
        emit SeriesActivated(valuationIdr_, supply_, refPriceIdr_, evidenceHash);
    }

    // ------------------------------------------------------------------ alokasi (pesanan yang ditandatangani investor)

    /// @notice Alokasikan token dari treasury untuk pesanan yang ditandatangani investor sendiri, dieksekusi platform setelah
    ///         rupiahnya masuk (bukti pembayaran di-hash di `paymentEvidence`). Tiap pesanan wajib `paidIdr == tokens × refPrice`,
    ///         investor di allowlist dan tidak dibekukan, pesanan belum kedaluwarsa dan belum pernah dipakai.
    function allocate(Order[] calldata orders, bytes[] calldata investorSigs, bytes32 paymentEvidence)
        external
        nonReentrant
        onlyRole(CONTROLLER_ROLE)
        inState(State.Active)
    {
        if (orders.length == 0 || orders.length != investorSigs.length) revert LengthMismatch();
        uint256 total;
        for (uint256 i = 0; i < orders.length; i++) total += orders[i].tokens;
        if (total > token.balanceOf(treasury)) revert InsufficientTreasury();

        uint64 unlockAt = uint64(block.timestamp) + params.lockPeriod;
        _settle(treasury);
        for (uint256 i = 0; i < orders.length; i++) {
            Order calldata o = orders[i];
            address a = o.investor;
            if (block.timestamp > o.deadline) revert OrderExpired();
            if (orderUsed[o.orderId]) revert OrderUsed();
            if (disputed[_orderRef(o.orderId)]) revert ItemDisputed();
            if (ECDSA.recover(orderDigest(o), investorSigs[i]) != a) revert BadInvestorSignature();
            if (o.tokens == 0 || o.paidIdr != o.tokens * refPriceIdr) revert BadPrice();
            if (!token.isVerified(a)) revert NotVerified(a);
            if (token.frozen(a)) revert IsFrozen(a);
            if ((token.balanceOf(a) + o.tokens) * 10_000 > uint256(params.maxHoldingBps) * supply) revert HoldingCapExceeded(a);
            orderUsed[o.orderId] = true;
            _settle(a);
            if (token.balanceOf(a) == 0) holderCount++;
            token.allocateFromTreasury(a, o.tokens, unlockAt);
            emit Allocated(o.orderId, a, o.tokens, o.paidIdr, unlockAt, paymentEvidence);
        }
    }

    // ------------------------------------------------------------------ periode bulanan (REVENUE_PERIOD)

    /// @notice Posting satu periode. Kontrak memeriksa potongan ≤ gross dan opex ≤ plafon, lalu menghitung waterfall:
    ///         D = gross − potongan; P_SPV = D × X; P_inv = P_SPV × (1 − m). Akumulator memakai P_inv; dust dibawa ke periode berikutnya.
    ///         Penanda tangan: PLATFORM + COUNTERPARTY; bila owner diam melewati akhir periode + ownerSignWindow, PLATFORM + VERIFIER.
    function postRevenuePeriod(uint256 periodId, uint64 periodEnd, Waterfall calldata w, bytes32 evidenceHash, uint64 deadline, bytes[] calldata sigs)
        external
        nonReentrant
        onlyRole(CONTROLLER_ROLE)
    {
        if (state != State.Active && state != State.Disputed && state != State.Overdue && state != State.Liquidating) revert WrongState(state);
        if (periodId != lastPeriodId + 1) revert BadPeriod();
        if (periodEnd > block.timestamp || (periodId > 1 && periodEnd <= periods[periodId - 1].periodEnd)) revert BadPeriod();
        if (disputed[_periodRef(periodId)]) revert ItemDisputed();

        uint256 deductions = w.refunds + w.opex + w.tax + w.operatorFee + w.reserve + w.platformFee;
        if (deductions > w.gross) revert DeductionsExceedGross();
        if (w.opex * 10_000 > uint256(params.maxOpexBps) * w.gross) revert OpexAboveCap();

        bool ownerSilent = block.timestamp > uint256(periodEnd) + params.ownerSignWindow;
        bytes32 payload = keccak256(abi.encode(periodId, periodEnd, w, evidenceHash));
        registry.verify(AttestationRegistry.Kind.REVENUE_PERIOD, periodId, payload, deadline, ownerSilent, sigs);

        uint256 d = w.gross - deductions;
        uint256 pSpv = (d * params.stakeBps) / 10_000;
        uint256 pInv = pSpv - (pSpv * params.spvFeeBps) / 10_000;

        uint256 totalE18 = pInv * 1e18 + dustE18;
        uint256 delta = totalE18 / supply;
        dustE18 = totalE18 % supply;
        accPerTokenE18 += delta;

        uint256 circulating = supply - token.balanceOf(treasury);
        uint256 owed = (circulating * delta) / 1e18;
        uint256 slack = holderCount < owed ? holderCount : owed;
        uint64 due = uint64(block.timestamp) + params.payoutWindow;
        lastPeriodId = periodId;
        Period storage p = periods[periodId];
        p.periodEnd = periodEnd;
        p.payoutDue = due;
        p.distributable = d;
        p.poolInvestors = pInv;
        p.deltaE18 = delta;
        p.owedIdr = owed;
        p.minSettleIdr = owed - slack;
        p.settled = owed == 0;
        p.evidenceHash = evidenceHash;
        emit PeriodPosted(periodId, d, pInv, owed, due, evidenceHash);
    }

    /// @notice Platform mencatat bahwa dana jatah periode sudah ada di rekening distribusi dan dikreditkan ke ledger investor.
    ///         Tidak bisa melebihi kewajiban. Boleh bertahap. `payoutRoot` = akar Merkle kredit per investor, sehingga investor
    ///         dapat membuktikan kreditnya termasuk. Bila tidak dicatat sampai tenggat, siapa pun dapat memicu Overdue.
    function settlePayout(uint256 periodId, uint256 paidIdr, bytes32 payoutRoot) external nonReentrant onlyRole(CONTROLLER_ROLE) {
        Period storage p = periods[periodId];
        if (periodId == 0 || periodId > lastPeriodId) revert BadPeriod();
        if (paidIdr == 0 || p.paidIdr + paidIdr > p.owedIdr) revert ExceedsOwed();
        p.payoutCount++;
        p.paidIdr += paidIdr;
        p.payoutRoot = payoutRoot;
        if (!p.settled && p.paidIdr >= p.minSettleIdr) {
            p.settled = true;
            if (p.overdue) {
                p.overdue = false;
                overduePeriods--;
                if (overduePeriods == 0 && state == State.Overdue) state = State.Active;
            }
        }
        emit PayoutSettled(periodId, paidIdr, p.paidIdr, payoutRoot, p.settled);
    }

    /// @notice Siapa pun boleh menandai Overdue bila dana jatah belum ter-attest tersedia sampai tenggat.
    function markOverdue(uint256 periodId) external {
        Period storage p = periods[periodId];
        if (periodId == 0 || periodId > lastPeriodId) revert BadPeriod();
        if (p.settled || p.owedIdr == 0) revert NothingOwed();
        if (block.timestamp <= p.payoutDue) revert NotOverdueYet();
        if (!p.overdue) {
            p.overdue = true;
            overduePeriods++;
        }
        if (state == State.Active || state == State.Disputed) state = State.Overdue;
        emit Overdue(periodId);
    }

    /// @notice Siapa pun boleh menandai Defaulted bila periode Overdue melewati masa toleransi.
    function markDefaulted(uint256 periodId) external inState(State.Overdue) {
        Period storage p = periods[periodId];
        if (!p.overdue || p.settled) revert NothingOwed();
        if (block.timestamp <= uint256(p.payoutDue) + params.defaultGrace) revert NotOverdueYet();
        state = State.Defaulted;
        emit Defaulted(periodId);
    }

    /// @notice Pulih dari Defaulted setelah semua kewajiban terlunasi dan disetujui.
    function restoreFromDefault() external onlyRole(DEFAULT_ADMIN_ROLE) inState(State.Defaulted) {
        if (overduePeriods != 0) revert UnsettledPeriods();
        state = openDisputes > 0 ? State.Disputed : State.Active;
        emit Restored();
    }

    // ------------------------------------------------------------------ jual balik (permintaan yang ditandatangani pemegang)

    /// @notice Jual balik ke treasury atas permintaan yang ditandatangani pemegang sendiri, dieksekusi platform setelah dana dari
    ///         cadangan buyback dikreditkan. Hanya lot yang sudah terbuka, seri Active, harga `refPrice × (1 − d)`.
    function executeSellBack(SellBack calldata r, bytes calldata holderSig, bytes32 paymentEvidence)
        external
        nonReentrant
        onlyRole(CONTROLLER_ROLE)
        inState(State.Active)
    {
        if (block.timestamp > r.deadline) revert OrderExpired();
        if (sellBackUsed[r.requestId]) revert OrderUsed();
        if (ECDSA.recover(sellBackDigest(r), holderSig) != r.holder) revert BadInvestorSignature();
        if (r.tokens == 0 || r.paidIdr * 10_000 != r.tokens * refPriceIdr * (10_000 - params.sellbackDiscountBps)) revert BadPrice();
        if (token.frozen(r.holder)) revert IsFrozen(r.holder);
        sellBackUsed[r.requestId] = true;
        _settle(r.holder);
        _settle(treasury);
        token.returnToTreasury(r.holder, r.tokens);
        if (token.balanceOf(r.holder) == 0) holderCount--;
        emit SellBackExecuted(r.requestId, r.holder, r.tokens, r.paidIdr, paymentEvidence);
    }

    // ------------------------------------------------------------------ revaluasi (VALUATION_UPDATE)

    /// @notice Revaluasi hanya mengubah harga referensi untuk transaksi BARU. Jumlah token dan hak per token tidak berubah.
    function updateValuation(uint256 newValuationIdr, bytes32 evidenceHash, uint64 deadline, bytes[] calldata sigs)
        external
        nonReentrant
        inState(State.Active)
    {
        uint256 newRef = (newValuationIdr * params.stakeBps) / 10_000 / supply;
        if (newRef == 0) revert BadPrice();
        uint256 nonce = valuationNonce + 1;
        bytes32 payload = keccak256(abi.encode(nonce, newValuationIdr, newRef, evidenceHash));
        registry.verify(AttestationRegistry.Kind.VALUATION_UPDATE, nonce, payload, deadline, false, sigs);
        valuationNonce = nonce;
        valuationIdr = newValuationIdr;
        refPriceIdr = newRef;
        emit ValuationUpdated(nonce, newValuationIdr, newRef, evidenceHash);
    }

    // ------------------------------------------------------------------ sengketa

    /// @notice Attestor (slot mana pun) atau ADMIN menandai item bersengketa. Item itu ditahan, item lain tetap berjalan.
    function raiseDispute(bytes32 itemRef, bytes32 reasonHash) external {
        if (!_isAttestor(msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAttestor();
        if (disputed[itemRef]) revert AlreadyDisputed();
        disputed[itemRef] = true;
        openDisputes++;
        if (state == State.Active) state = State.Disputed;
        emit DisputeRaised(itemRef, reasonHash, msg.sender);
    }

    /// @notice Verifier (penengah independen) atau ADMIN menyelesaikan sengketa dengan kode alasan.
    function resolveDispute(bytes32 itemRef, bytes32 reasonHash) external {
        if (msg.sender != registry.verifier() && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAttestor();
        if (!disputed[itemRef]) revert NotDisputed();
        disputed[itemRef] = false;
        openDisputes--;
        if (openDisputes == 0 && state == State.Disputed) state = State.Active;
        emit DisputeResolved(itemRef, reasonHash, msg.sender);
    }

    // ------------------------------------------------------------------ kepatuhan

    function setVerified(address account, bool verified) external onlyRole(CONTROLLER_ROLE) {
        token.setVerified(account, verified);
        emit VerifiedHolder(account, verified);
    }

    function setFrozen(address account, bool value) external onlyRole(CONTROLLER_ROLE) {
        token.setFrozen(account, value);
        emit Frozen(account, value);
    }

    /// @notice Pemindahan paksa untuk kepatuhan (mis. putusan, kehilangan akses). Penerima wajib terverifikasi; event wajib.
    function forcedTransfer(address from, address to, uint256 tokens, bytes32 reasonCode) external nonReentrant onlyRole(CONTROLLER_ROLE) {
        if (state == State.Closed) revert WrongState(state);
        if (to != treasury && !token.isVerified(to)) revert NotVerified(to);
        if (reasonCode == bytes32(0)) revert BadParams();
        _settle(from);
        _settle(to);
        bool toWasEmpty = token.balanceOf(to) == 0;
        token.forced(from, to, tokens);
        if (from != treasury && token.balanceOf(from) == 0) holderCount--;
        if (to != treasury && toWasEmpty && tokens > 0) holderCount++;
        emit ForcedTransfer(from, to, tokens, reasonCode);
    }

    // ------------------------------------------------------------------ peristiwa penutup

    function beginLiquidation(bytes32 evidenceHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (state == State.Draft || state == State.Verified || state == State.Liquidating || state == State.Closed) revert WrongState(state);
        state = State.Liquidating;
        emit LiquidationStarted(evidenceHash);
    }

    /// @notice Tutup seri setelah distribusi akhir lunas. Token tetap ada, tetapi tidak lagi bernilai klaim. Tanpa burn.
    function closeSeries() external onlyRole(DEFAULT_ADMIN_ROLE) inState(State.Liquidating) {
        if (overduePeriods != 0 || (lastPeriodId > 0 && !periods[lastPeriodId].settled)) revert UnsettledPeriods();
        state = State.Closed;
        emit SeriesClosed();
    }

    // ------------------------------------------------------------------ view

    /// @notice Total jatah rupiah (kumulatif) untuk pemegang, termasuk yang belum diselesaikan.
    function claimableOf(address holder) public view returns (uint256) {
        return accruedIdr[holder] + (token.balanceOf(holder) * (accPerTokenE18 - lastAccE18[holder])) / 1e18;
    }

    function periodOf(uint256 periodId) external view returns (Period memory) {
        return periods[periodId];
    }

    /// @notice Digest EIP-712 yang ditandatangani investor untuk pesanan beli.
    function orderDigest(Order calldata o) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, o.investor, o.tokens, o.paidIdr, o.orderId, o.deadline)));
    }

    /// @notice Digest EIP-712 yang ditandatangani pemegang untuk jual balik.
    function sellBackDigest(SellBack calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(SELLBACK_TYPEHASH, r.holder, r.tokens, r.paidIdr, r.requestId, r.deadline)));
    }

    function periodRef(uint256 periodId) external pure returns (bytes32) {
        return _periodRef(periodId);
    }

    function orderRef(uint256 orderId) external pure returns (bytes32) {
        return _orderRef(orderId);
    }

    // ------------------------------------------------------------------ internal

    function _settle(address a) private {
        uint256 acc = accPerTokenE18;
        uint256 last = lastAccE18[a];
        if (acc != last) {
            accruedIdr[a] += (token.balanceOf(a) * (acc - last)) / 1e18;
            lastAccE18[a] = acc;
        }
    }

    function _isAttestor(address a) private view returns (bool) {
        return a == registry.platform() || a == registry.verifier() || a == registry.counterpartyOf(address(this));
    }

    function _periodRef(uint256 periodId) private pure returns (bytes32) {
        return keccak256(abi.encode("PERIOD", periodId));
    }

    function _orderRef(uint256 orderId) private pure returns (bytes32) {
        return keccak256(abi.encode("ORDER", orderId));
    }
}
