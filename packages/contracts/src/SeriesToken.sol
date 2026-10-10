// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SeriesToken
/// @notice ERC-20 `decimals = 0` for one venue series. Implements the main ERC-3643 "lite" features (PRD v4.1 §6.3):
///         allowlist (`isVerified`), `canTransfer` with reason codes, `freeze`, and controlled transfers. Not a full
///         ERC-3643 implementation and not claimed to be ERC-3643 compliant.
/// @dev Investors cannot move tokens themselves: `transfer`/`transferFrom`/`approve` always revert. Tokens move only
///      through the series contract (allocation from treasury, sell-back to treasury, `forcedTransfer`). Supply is minted
///      once, with no burn. Each allocation forms a lot `{amount, unlockAt}` (FIFO, max 32). When lots are full, a new lot
///      merges into the last one at the LATER of the two unlock times, so merging never unlocks earlier.
contract SeriesToken is ERC20 {
    uint256 public constant MAX_LOTS = 32;

    // canTransfer reason codes
    uint8 public constant OK = 0;
    uint8 public constant NOT_VERIFIED = 1;
    uint8 public constant FROZEN = 2;
    uint8 public constant INVESTOR_TO_INVESTOR = 3;
    uint8 public constant LOCKED = 4;
    uint8 public constant INSUFFICIENT_BALANCE = 5;

    struct Lot {
        uint128 amount;
        uint64 unlockAt;
    }

    address public immutable series;
    address public treasury;
    bool public minted;
    mapping(address => bool) public isVerified;
    mapping(address => bool) public frozen;
    mapping(address => Lot[]) internal _lots;

    event Verified(address indexed account, bool verified);
    event Frozen(address indexed account, bool frozen);

    error OnlySeries();
    error AlreadyMinted();
    error TransfersRestricted();
    error LockedTokens();
    error InsufficientLots();
    error ZeroAddress();

    modifier onlySeries() {
        if (msg.sender != series) revert OnlySeries();
        _;
    }

    constructor(string memory name_, string memory symbol_, address series_) ERC20(name_, symbol_) {
        series = series_;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    // ------------------------------------------------------------------ plain transfers always locked

    function transfer(address, uint256) public pure override returns (bool) {
        revert TransfersRestricted();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert TransfersRestricted();
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert TransfersRestricted();
    }

    // ------------------------------------------------------------------ series only

    function mintSupply(address treasury_, uint256 amount) external onlySeries {
        if (minted) revert AlreadyMinted();
        if (treasury_ == address(0)) revert ZeroAddress();
        minted = true;
        treasury = treasury_;
        _mint(treasury_, amount);
    }

    function setVerified(address account, bool verified) external onlySeries {
        if (account == address(0)) revert ZeroAddress();
        isVerified[account] = verified;
        emit Verified(account, verified);
    }

    function setFrozen(address account, bool value) external onlySeries {
        if (account == address(0)) revert ZeroAddress();
        frozen[account] = value;
        emit Frozen(account, value);
    }

    /// @notice Allocation treasury → investor; forms one locked lot.
    function allocateFromTreasury(address to, uint256 amount, uint64 unlockAt) external onlySeries {
        _update(treasury, to, amount);
        _addLot(to, amount, unlockAt);
    }

    /// @notice Sell-back investor → treasury; only from unlocked lots (FIFO).
    function returnToTreasury(address from, uint256 amount) external onlySeries {
        _consume(from, amount, true);
        _update(from, treasury, amount);
    }

    /// @notice Forced transfer for compliance. The sender's lots move as-is (unlock times preserved).
    function forced(address from, address to, uint256 amount) external onlySeries {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (from == treasury) {
            _update(from, to, amount);
            if (to != treasury) _addLot(to, amount, 0);
            return;
        }
        Lot[] memory moved = _consume(from, amount, false);
        _update(from, to, amount);
        if (to != treasury) {
            for (uint256 i = 0; i < moved.length; i++) {
                if (moved[i].amount > 0) _addLot(to, moved[i].amount, moved[i].unlockAt);
            }
        }
    }

    // ------------------------------------------------------------------ view

    function lotsOf(address account) external view returns (Lot[] memory) {
        return _lots[account];
    }

    function unlockedBalanceOf(address account) public view returns (uint256 total) {
        Lot[] storage ls = _lots[account];
        for (uint256 i = 0; i < ls.length; i++) {
            if (ls[i].unlockAt <= block.timestamp) total += ls[i].amount;
        }
    }

    /// @notice Whether a transfer of `amount` from `from` to `to` is allowed, with a reason code (for the UI).
    function canTransfer(address from, address to, uint256 amount) external view returns (bool, uint8) {
        if (frozen[from] || frozen[to]) return (false, FROZEN);
        if (balanceOf(from) < amount) return (false, INSUFFICIENT_BALANCE);
        if (from == treasury) return isVerified[to] ? (true, OK) : (false, NOT_VERIFIED);
        if (to != treasury) return (false, INVESTOR_TO_INVESTOR);
        if (unlockedBalanceOf(from) < amount) return (false, LOCKED);
        return (true, OK);
    }

    // ------------------------------------------------------------------ lots

    function _addLot(address to, uint256 amount, uint64 unlockAt) private {
        Lot[] storage ls = _lots[to];
        uint256 n = ls.length;
        if (n > 0 && (ls[n - 1].unlockAt == unlockAt || n == MAX_LOTS)) {
            ls[n - 1].amount += uint128(amount);
            if (unlockAt > ls[n - 1].unlockAt) ls[n - 1].unlockAt = unlockAt;
            return;
        }
        ls.push(Lot(uint128(amount), unlockAt));
    }

    /// @dev Consume lots FIFO by `amount`. `onlyUnlocked` = sell-back: locked lots are skipped and never leave; if
    ///      unlocked lots are insufficient, revert `LockedTokens`.
    function _consume(address from, uint256 amount, bool onlyUnlocked) private returns (Lot[] memory moved) {
        Lot[] storage ls = _lots[from];
        moved = new Lot[](ls.length);
        uint256 remaining = amount;
        for (uint256 i = 0; i < ls.length && remaining > 0; i++) {
            if (onlyUnlocked && ls[i].unlockAt > block.timestamp) continue;
            uint256 take = ls[i].amount < remaining ? ls[i].amount : remaining;
            moved[i] = Lot(uint128(take), ls[i].unlockAt);
            ls[i].amount -= uint128(take);
            remaining -= take;
        }
        if (remaining > 0) {
            if (onlyUnlocked) revert LockedTokens();
            revert InsufficientLots();
        }
        // compact: drop empty lots, keep the order of the rest (max 32 elements)
        uint256 w;
        for (uint256 r = 0; r < ls.length; r++) {
            if (ls[r].amount == 0) continue;
            if (w != r) ls[w] = ls[r];
            w++;
        }
        while (ls.length > w) ls.pop();
    }
}
