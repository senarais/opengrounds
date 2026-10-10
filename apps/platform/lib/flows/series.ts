import type { Address, Hex } from "viem";
import { DEMO_PARAMS, buildDisclosure, canonicalJson, disclosureHash, tokenSymbolFor } from "@venue-rwa/shared";
import { kybGate } from "@venue-rwa/verification";
import { REGISTRY, attestationRegistryAbi, readSeries, venueSeriesAbi } from "../chain";
import { venueSeriesBytecode } from "../abi";
import { platformDb } from "../db";
import { acquisitionPayload, evidenceHashOf } from "../eip712";
import { audit, getSeries, moveCash, needContract } from "../flow";
import { operatorAddress, operatorDeploy, operatorSend, treasuryAddress } from "../operator";
import { addSignature, createAttestation, isReady, markSubmitted, signAsPlatform, sigsOf } from "./attest";
import { loadOnboarding, ownerOfVenue } from "./onboarding";
import { provisionPos } from "./provision";

const ACQUISITION_WINDOW_DAYS = 7;

/**
 * Setelah KYB disetujui (§3.3–3.4): valuasi final → workspace PoS → deploy VenueSeries → daftar di registry dengan owner sebagai
 * COUNTERPARTY → markVerified → attestation ACQUISITION_CLOSED disiapkan dan ditandatangani PLATFORM.
 * Token BELUM terbit: owner harus menandatangani juga (dana akuisisi diterima, simulasi), baru `activate` mencetak supply ke treasury.
 * `assetValue` = V_aset yang ditetapkan reviewer dari dokumen (demo: input reviewer, berlabel).
 */
export async function issueSeries(venueId: string, actor: string, assetValue: number) {
  const pf = platformDb();
  const { data: existing } = await pf.from("series").select("id").eq("venue_id", venueId).not("status", "eq", "Closed").limit(1);
  if (existing?.length) throw new Error("This venue already has a series.");
  const { data: kc } = await pf.from("kyb_cases").select("*").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(1).single();
  if (kc?.status !== "APPROVED") throw new Error("KYB has not been approved.");
  const ownerId = await ownerOfVenue(venueId);
  const { data: owner } = await pf.from("users").select("wallet, display_name").eq("id", ownerId).single();
  if (!owner?.wallet) throw new Error("The owner’s wallet is not ready. Ask them to open the owner portal once to create their Privy wallet.");

  const { input, venue, docs } = await loadOnboarding(venueId);
  const gate = kybGate(input, docs.map((d) => d.kind), { assetValue });
  if (!gate.valuation) throw new Error("Valuation could not be calculated.");
  const val = gate.valuation;
  const p = { ...DEMO_PARAMS, tokenPrice: input.offering.tokenPrice ?? DEMO_PARAMS.tokenPrice };

  const { data: valuationRow, error: ve } = await pf.from("valuations").insert({
    venue_id: venueId, v_aset: assetValue, d12: val.d12, r_bps: p.requiredYieldBps, v_income: val.vIncome, v: val.v, y_bps: val.yieldBps, in_band: val.inBand,
    stake_bps: input.offering.stakeBps, token_price: p.tokenPrice, supply: val.supply, ref_price: val.refPrice, inputs: { basis: val.basis, annualized: gate.financial.annualized, params: p },
    status: "approved", decided_by: actor,
  }).select("id").single();
  if (ve) throw new Error(ve.message);

  // halaman produk publik + hash (terikat ke evidence ACQUISITION_CLOSED)
  const disclosure = buildDisclosure(input, val, docs.map((d) => ({ kind: d.kind, sha256: d.sha256 })));
  const dHash = disclosureHash(disclosure);
  await pf.from("venues").update({ public_profile: disclosure.public, public_profile_hash: dHash }).eq("id", venueId);
  await provisionPos(venueId);

  const { data: taken } = await pf.from("series").select("symbol");
  const symbol = tokenSymbolFor(venue.name, (taken ?? []).map((t) => t.symbol));
  const name = `Grounds ${venue.name}`.slice(0, 48);
  const { data: series, error: se } = await pf.from("series").insert({
    venue_id: venueId, valuation_id: valuationRow!.id, status: "Draft", name, symbol, stake_bps: input.offering.stakeBps, spv_fee_bps: p.spvFeeBps, max_opex_bps: p.maxOpexBps,
    sellback_discount_bps: p.sellbackDiscountBps, max_holding_bps: p.maxHoldingBps, lock_seconds: p.lockSeconds, payout_window_seconds: p.payoutWindowSeconds,
    default_grace_seconds: p.defaultGraceSeconds, owner_sign_window_seconds: p.ownerSignWindowSeconds, split_bps: p.splitBps, supply: val.supply, ref_price: val.refPrice,
    valuation_idr: val.v, owner_wallet: owner.wallet,
  }).select("*").single();
  if (se) throw new Error(se.message);

  const op = operatorAddress();
  const { address, tx } = await operatorDeploy(venueSeriesAbi as any, venueSeriesBytecode as Hex, [op, op, REGISTRY.address, treasuryAddress(), name, symbol, {
    stakeBps: input.offering.stakeBps, spvFeeBps: p.spvFeeBps, maxOpexBps: p.maxOpexBps, sellbackDiscountBps: p.sellbackDiscountBps, maxHoldingBps: p.maxHoldingBps,
    lockPeriod: p.lockSeconds, payoutWindow: p.payoutWindowSeconds, defaultGrace: p.defaultGraceSeconds, ownerSignWindow: p.ownerSignWindowSeconds,
  }]);
  await pf.from("series").update({ contract_address: address, deployed_tx: tx }).eq("id", series!.id);
  await operatorSend(REGISTRY.address, attestationRegistryAbi as any, "registerSeries", [address, owner.wallet]);
  const kybHash = evidenceHashOf(canonicalJson({ case: kc.id, decidedBy: kc.decided_by, decidedAt: kc.decided_at, findings: kc.risk_summary?.counts ?? null }));
  await operatorSend(address, venueSeriesAbi as any, "markVerified", [kybHash]);
  const info = await readSeries(address);
  await pf.from("series").update({ status: "Verified", token_address: info.token }).eq("id", series!.id);
  await audit(actor, "series.deploy", { entity: "series", entityId: series!.id, after: { address, tx, symbol, valuation: val.v, supply: val.supply } });

  // The SPV submission already expresses its acquisition intent; only the owner's confirmation remains.
  await prepareAcquisition(series!.id);
  return { seriesId: series!.id as string, address };
}

/** Prepare and sign automatically after KYB approval. The SPV does not repeat its submission approval. */
export async function prepareAcquisition(seriesId: string, profileHash?: Hex) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const s = ctx.series;
  if (s.status !== "Verified") throw new Error("Acquisition can only be prepared for a verified series.");
  const pf = platformDb();
  const review = await pf.from("kyb_cases").select("status").eq("venue_id", s.venue_id).order("created_at", { ascending: false }).limit(1).single();
  if (review.error || review.data?.status !== "APPROVED") throw new Error("Review is not approved. The acquisition signature is not ready.");
  const evidenceHash = evidenceHashOf(canonicalJson({ profile: profileHash ?? ctx.venue.public_profile_hash, valuation: s.valuation_id, simulated: true }));
  const payload = { valuation: String(s.valuation_idr), supply: String(s.supply), refPrice: String(s.ref_price), stakeBps: s.stake_bps, spvFeeBps: s.spv_fee_bps, evidenceHash };
  const payloadHash = acquisitionPayload({ valuation: BigInt(s.valuation_idr), supply: BigInt(s.supply), refPrice: BigInt(s.ref_price), stakeBps: s.stake_bps, spvFeeBps: s.spv_fee_bps, evidenceHash });
  const { data: existing, error: existingError } = await pf.from("attestations").select("*").eq("series_id", seriesId).eq("kind", "ACQUISITION_CLOSED").eq("ref_id", "0").maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.status === "submitted") throw new Error("Acquisition has already been submitted on-chain.");
  // Keep compatibility with the existing schema; these fields now record submission intent, not an extra approval step.
  if (!s.spv_approved_at) {
    const submitter = ctx.venue.submitted_by ?? "legacy-submission";
    const recordedAt = ctx.venue.created_at ?? new Date().toISOString();
    const { error } = await pf.from("series").update({ spv_approved_by: submitter, spv_approved_at: recordedAt, spv_note: "Purchase approval is included in the SPV application; the owner still confirms rights transfer and payment." }).eq("id", seriesId).is("spv_approved_at", null);
    if (error) throw new Error(error.message);
    await audit("platform", "acquisition.submission_recognized", { entity: "series", entityId: seriesId, detail: { submittedBy: submitter, submittedAt: recordedAt, simulated: true } });
  }
  if (existing?.status === "collecting" && existing.payload_hash === payloadHash && Date.parse(existing.deadline) > Date.now()) {
    if (!(existing.signatures ?? []).some((sig: { slot: string }) => sig.slot === "PLATFORM")) await signAsPlatform(existing.id, addr);
    return existing.id as string;
  }
  const att = await createAttestation({ seriesId, kind: "ACQUISITION_CLOSED", refId: 0, payload, payloadHash, evidenceHash, deadline: new Date(Date.now() + ACQUISITION_WINDOW_DAYS * 86_400_000) });
  await signAsPlatform(att.id, addr);
  return att.id as string;
}

/**
 * Owner signs ACQUISITION_CLOSED with their Privy wallet: rights transfer and simulated acquisition payment receipt.
 * Once both signatures are complete, `activate` verifies them and mints the fixed supply to treasury.
 */
export async function ownerSignAcquisition(seriesId: string, attId: string, signature: Hex) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const { att } = await addSignature(attId, addr, signature, { expectSlot: "COUNTERPARTY" });
  if (!isReady(att)) return "Signature saved. Waiting for the platform signature.";
  return activateIfReady(seriesId);
}

export async function activateIfReady(seriesId: string) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const pf = platformDb();
  const { data: att } = await pf.from("attestations").select("*").eq("series_id", seriesId).eq("kind", "ACQUISITION_CLOSED").eq("status", "collecting").maybeSingle();
  if (!att || !isReady(att)) throw new Error("Acquisition attestation is incomplete.");
  const s = ctx.series;
  const deadline = BigInt(Math.floor(Date.parse(att.deadline) / 1000));
  const tx = await operatorSend(addr, venueSeriesAbi as any, "activate", [BigInt(s.valuation_idr), BigInt(s.supply), BigInt(s.ref_price), att.evidence_hash, deadline, sigsOf(att)]);
  await markSubmitted(att.id, tx);
  await pf.from("series").update({ status: "Active", activated_tx: tx }).eq("id", seriesId);
  // pembayaran akuisisi ke owner = S = V × X, dari modal SPV (simulasi, §2.4)
  await moveCash(seriesId, `acquisition-${seriesId}`, [["owner", Math.floor((Number(s.valuation_idr) * s.stake_bps) / 10_000)]]);
  await audit("platform", "series.activate", { entity: "series", entityId: seriesId, after: { tx, supply: s.supply, refPrice: s.ref_price } });
  return `Series active. ${Number(s.supply).toLocaleString("en-US")} tokens minted once to the Grounds treasury.`;
}

/** Sinkronkan status seri dari chain (Overdue/Defaulted/Disputed bisa dipicu dari luar platform). */
export async function syncState(seriesId: string) {
  const ctx = await getSeries(seriesId);
  if (!ctx.address) return ctx.series.status;
  const info = await readSeries(ctx.address);
  if (info.state !== ctx.series.status) await platformDb().from("series").update({ status: info.state }).eq("id", seriesId);
  return info.state;
}

export async function seriesOfVenue(venueId: string) {
  const { data } = await platformDb().from("series").select("*").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function listProducts() {
  const pf = platformDb();
  const { data: series } = await pf.from("series").select("*").not("contract_address", "is", null).order("created_at", { ascending: false });
  const ids = [...new Set((series ?? []).map((s) => s.venue_id))];
  const { data: venues } = ids.length ? await pf.from("venues").select("id, name, city, province, sports, public_profile, facilities") .in("id", ids) : { data: [] as any[] };
  const byId = new Map((venues ?? []).map((v) => [v.id, v]));
  return (series ?? []).map((s) => ({ series: s, venue: byId.get(s.venue_id)! })).filter((x) => x.venue);
}

export type { Address };
