// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAssetAttestation {
    function isValid(address series) external view returns (bool);
    function maxPrice(address series) external view returns (uint256);
    function maxShareBps(address series) external view returns (uint16);
    function lockShare(uint16 shareBps) external;
    function releaseShare() external;
}
