// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AssetAttestation} from "../src/AssetAttestation.sol";
import {IAssetAttestation} from "../src/interfaces/IAssetAttestation.sol";
import {Series} from "../src/Series.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --sender <DEPLOYER_ADDRESS> --broadcast --verify
/// Env: DEPLOYER_ADDRESS, SIGNER_1_ADDRESS, SIGNER_2_ADDRESS, SIGNER_3_ADDRESS (SIGNER_3 = pihak independen),
///      OPERATOR_ADDRESS (opsional, default deployer).
/// Alamat penandatangan diurutkan naik di sini; kontrak tidak peduli urutan set, hanya urutan tanda tangan.
contract Deploy is Script {
    function run() external {
        // Penandatangan transaksi datang dari CLI (--account <keystore> --sender <alamat>), bukan dari env:
        // private key tidak pernah dibaca script, jadi tidak muncul di trace/log.
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);

        address[3] memory signers = [vm.envAddress("SIGNER_1_ADDRESS"), vm.envAddress("SIGNER_2_ADDRESS"), vm.envAddress("SIGNER_3_ADDRESS")];
        address auditor = signers[2];

        vm.startBroadcast(deployer);
        AssetAttestation att = new AssetAttestation(signers);
        // Seri demo: target Rp150jt, minRaise Rp100jt (Cara 1), Rp15.000/token, 10% omzet, tenor 365 hari, penawaran 7 hari.
        Series series = new Series(
            deployer,
            operator,
            auditor,
            IAssetAttestation(address(att)),
            "Padel Demo Series",
            "PDLD",
            Series.Terms({
                target: 150_000_000,
                minRaise: 100_000_000,
                unitPrice: 15_000,
                shareBps: 1000,
                tenorDays: 365,
                offeringDuration: 7 days
            })
        );
        vm.stopBroadcast();

        console.log("AssetAttestation", address(att));
        console.log("Series          ", address(series));
        console.log("SeriesToken     ", address(series.token()));

        string memory json = string.concat(
            '{"chainId":', vm.toString(block.chainid),
            ',"AssetAttestation":"', vm.toString(address(att)),
            '","Series":"', vm.toString(address(series)),
            '","SeriesToken":"', vm.toString(address(series.token())),
            '"}'
        );
        vm.writeFile(string.concat("deployments/", vm.envOr("DEPLOY_OUT", string("latest")), ".json"), json);
    }
}
