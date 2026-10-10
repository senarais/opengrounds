// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VenueSeries} from "../src/VenueSeries.sol";

/// @dev Cross-language parity: payload hashes computed by the TypeScript backend (apps/platform/lib/eip712.ts,
///      scripts/parity.ts) must be identical to the contract's. The constants below come from that script's output.
contract ParityTest is Test {
    bytes32 constant EV = bytes32(hex"1111111111111111111111111111111111111111111111111111111111111111");

    function test_acquisitionPayload() public pure {
        bytes32 h = keccak256(
            abi.encode(uint256(2_000_000_000), uint256(100_000), uint256(10_000), uint16(5000), uint16(200), EV)
        );
        assertEq(h, 0x094bbeabfbb49c1f27765bb86c4206f8da4941beed2e813219f77413a7a2dc91);
    }

    function test_periodPayload() public pure {
        VenueSeries.Waterfall memory w =
            VenueSeries.Waterfall(52_000_000, 1_000_000, 27_000_000, 1_500_000, 4_000_000, 2_000_000, 1_500_000);
        bytes32 h = keccak256(abi.encode(uint256(1), uint64(1_800_000_000), w, EV));
        assertEq(h, 0xb67a43f3399027b534c40af0485fbe450db4b5367c1c64325ab624eb4a172088);
    }

    function test_valuationPayload() public pure {
        bytes32 h = keccak256(abi.encode(uint256(1), uint256(2_200_000_000), uint256(11_000), EV));
        assertEq(h, 0x45c995ff6f65bf319d60713b48d729441629f45fd3924b5c5d6829818ede5a23);
    }
}
