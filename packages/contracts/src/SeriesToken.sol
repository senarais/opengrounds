// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SeriesToken
/// @notice ERC-20 decimals = 0 (tidak bisa dipecah). Transfer ERC-20 langsung terkunci. Token hanya bisa bergerak lewat
///         Series: mint ke alamat allowlist, burn, dan `move` antar dua alamat allowlist (aturannya dijaga Series).
///         Tidak ada harga pasar / listing.
contract SeriesToken is ERC20 {
    address public immutable series;
    mapping(address => bool) public allowed;
    bool private _moving;

    error OnlySeries();
    error TransfersLocked();
    error NotAllowlisted(address to);
    error SymbolTooLong();

    event AllowlistSet(address indexed account, bool allowed);

    modifier onlySeries() {
        if (msg.sender != series) revert OnlySeries();
        _;
    }

    constructor(string memory name_, string memory symbol_, address series_) ERC20(name_, symbol_) {
        if (bytes(symbol_).length > 5) revert SymbolTooLong(); // batas wallet_watchAsset
        series = series_;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function setAllowed(address account, bool ok) external onlySeries {
        allowed[account] = ok;
        emit AllowlistSet(account, ok);
    }

    function mint(address to, uint256 amount) external onlySeries {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlySeries {
        _burn(from, amount);
    }

    /// @notice Pindahkan token antar dua pemegang ber-KYC. Hanya Series, yang memeriksa state, saldo bebas, dan tanda tangan pengirim.
    function move(address from, address to, uint256 amount) external onlySeries {
        if (!allowed[from]) revert NotAllowlisted(from);
        if (!allowed[to]) revert NotAllowlisted(to);
        _moving = true;
        _transfer(from, to, amount);
        _moving = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0)) {
            if (!allowed[to]) revert NotAllowlisted(to);
        } else if (to != address(0) && !_moving) {
            revert TransfersLocked();
        }
        super._update(from, to, value);
    }
}
