
import { serviceClient } from "@venue-rwa/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { execSync } from "child_process";
import { issueSeries, prepareAcquisition, ownerSignAcquisition } from "../apps/platform/lib/flows/series";
import { platformDb } from "../apps/platform/lib/db";
import { acquisitionPayload } from "../apps/platform/lib/eip712";
import { REGISTRY, chain } from "../apps/platform/lib/chain";

const args = process.argv.slice(2);
const variant = args[0] || "futsal";
const email = args[1] || `owner-${variant}@demo.com`;

async function main() {
  console.log(`\n=== Seeding demo for ${variant} ===`);
  // 1. Run seed-demo.ts
  execSync(`pnpm --filter @venue-rwa/platform seed:demo --variant=${variant} -- ${email}`, { stdio: "inherit" });

  const db = serviceClient("platform");
  
  // 2. Setup owner wallet
  const { data: user } = await db.from("users").select("id").eq("email", email).single();
  if (!user) throw new Error("Owner not found");
  
  const ownerPk = generatePrivateKey();
  const ownerAccount = privateKeyToAccount(ownerPk);
  await db.from("users").update({ wallet: ownerAccount.address }).eq("id", user.id);
  console.log(`Owner wallet set to ${ownerAccount.address}`);

  // 3. Find case
  const { data: caseRow } = await db.from("kyb_cases")
    .select("id, venue_id, status")
    .eq("status", "IN_REVIEW")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
    
  if (!caseRow) throw new Error("No IN_REVIEW case found");
  
  // 4. Force approve KYB case
  console.log(`Approving case ${caseRow.id}...`);
  await db.from("kyb_cases").update({ status: "APPROVED", decided_by: "system" }).eq("id", caseRow.id);

  // 5. Issue Series
  console.log(`Deploying series for venue ${caseRow.venue_id}...`);
  // assetValue: futsal=1.5B, padel=3B, tenis=5B (based on examples in seed-demo)
  const valMap: Record<string, number> = { futsal: 1500000000, padel: 3000000000, tenis: 5000000000 };
  const assetValue = valMap[variant] || 1500000000;
  
  await issueSeries(caseRow.venue_id, "system", assetValue);

  // 6. Prepare Acquisition
  const { data: seriesRow } = await db.from("series").select("id").eq("venue_id", caseRow.venue_id).order("created_at", { ascending: false }).limit(1).single();
  console.log(`Preparing acquisition for series ${seriesRow!.id}...`);
  const attId = await prepareAcquisition(seriesRow!.id);

  const { data: att } = await db.from("attestations").select("*").eq("id", attId).single();
  const { data: series } = await db.from("series").select("contract_address").eq("id", seriesRow!.id).single();
  
  const { attMessage, attestationTypes, registryDomain } = await import("../apps/platform/lib/eip712");
  
  const domain = registryDomain();
  const message = attMessage("ACQUISITION_CLOSED", series!.contract_address, att!.ref_id, att!.payload_hash, BigInt(Math.floor(Date.parse(att!.deadline) / 1000)));

  const signature = await ownerAccount.signTypedData({ domain, types: attestationTypes, primaryType: "Attestation", message });
  console.log("Owner signed acquisition. Activating series...");
  
  const result = await ownerSignAcquisition(seriesRow!.id, attId, signature);
  console.log(result);
  
  console.log(`\n=== Series for ${variant} is Active! ===\n`);
}

main().catch(console.error);
