// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --sender <DEPLOYER_ADDRESS> --broadcast --verify
/// Deploys the shared AttestationRegistry. The backend creates a VenueSeries per venue after KYB and valuation approval.
/// Env:
///   DEPLOYER_ADDRESS            deploy transaction sender
///   ATTESTOR_PLATFORM_ADDRESS   PLATFORM slot (Open Grounds side). Default: OPERATOR_ADDRESS
///   ATTESTOR_VERIFIER_ADDRESS   VERIFIER slot (independent reviewer). Default: SIGNER_3_ADDRESS
///   REGISTRY_ADMIN_ADDRESS      registry ADMIN (registers series). Default: OPERATOR_ADDRESS. Production: multisig.
contract Deploy is Script {
    function run() external {
        // The script never reads a private key: the transaction signer comes from the CLI (--account/--sender).
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        address platform = vm.envOr("ATTESTOR_PLATFORM_ADDRESS", operator);
        address verifier = vm.envOr("ATTESTOR_VERIFIER_ADDRESS", vm.envAddress("SIGNER_3_ADDRESS"));
        address admin = vm.envOr("REGISTRY_ADMIN_ADDRESS", operator);

        vm.startBroadcast(deployer);
        AttestationRegistry registry = new AttestationRegistry(admin, platform, verifier);
        vm.stopBroadcast();

        console.log("AttestationRegistry", address(registry));
        console.log("platform           ", platform);
        console.log("verifier           ", verifier);
        console.log("admin              ", admin);

        string memory json = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"AttestationRegistry":"',
            vm.toString(address(registry)),
            '","platform":"',
            vm.toString(platform),
            '","verifier":"',
            vm.toString(verifier),
            '"}'
        );
        vm.writeFile(string.concat("deployments/", vm.envOr("DEPLOY_OUT", string("latest")), ".json"), json);
    }
}
