import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { canonicalJson, revaluedRefPrice } from "@venue-rwa/shared";
import { publicClient, readSeries, seriesTokenAbi, venueSeriesAbi } from "../chain";
import { platformDb } from "../db";
import { evidenceHashOf, orderTypes, seriesDomain, toChainWaterfall, valuationPayload } from "../eip712";
import { audit, getSeries, needContract } from "../flow";
import { operatorSend, operatorTry, platformSignTyped } from "../operator";
import { addSignature, createAttestation, isReady, markSubmitted, signAsPlatform, sigsOf, typedDataOf } from "./attest";

// ---------------------------------------------------------------- revaluasi (VALUATION_UPDATE: PLATFORM + VERIFIER)

/** Usulan revaluasi: hanya harga referensi untuk transaksi baru yang berubah (§4.9). PLATFORM menandatangani; verifier melengkapi. */
export async function proposeValuation(seriesId: string, newValuation: number, reason: string, actor: string) {
  if (reason.trim().length < 10) throw new Error("Tulis dasar revaluasi (minimal 10 karakter)");
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const info = await readSeries(addr);
  if (info.state !== "Active") throw new Error("Revaluasi hanya saat seri Active");
  const nonce = (await publicClient.readContract({ address: addr, abi: venueSeriesAbi, functionName: "valuationNonce" })) + 1n;
  const newRef = revaluedRefPrice(newValuation, ctx.series.stake_bps, Number(info.supply));
  if (newRef <= 0) throw new Error("Harga referensi baru nol");
  const evidenceHash = evidenceHashOf(canonicalJson({ series: addr, nonce: String(nonce), newValuation, reason, by: actor }));
  const payloadHash = valuationPayload(nonce, BigInt(newValuation), BigInt(newRef), evidenceHash);
  const att = await createAttestation({ seriesId, kind: "VALUATION_UPDATE", refId: nonce, payload: { nonce: String(nonce), newValuation, newRef, reason }, payloadHash, evidenceHash, deadline: new Date(Date.now() + 7 * 86_400_000) });
  await signAsPlatform(att.id, addr);
  await audit(actor, "valuation.propose", { entity: "series", entityId: seriesId, before: { valuation: String(info.valuationIdr), ref: String(info.refPriceIdr) }, after: { newValuation, newRef } });
  return `Usulan revaluasi tercatat: harga referensi baru Rp${newRef.toLocaleString("id-ID")}. Menunggu tanda tangan verifier.`;
}

/** Tanda tangan verifier (reviewer independen) untuk VALUATION_UPDATE; lengkap → dikirim ke kontrak. */
export async function verifierSignValuation(attId: string, signature: Hex) {
  const pf = platformDb();
  const { data: att } = await pf.from("attestations").select("*").eq("id", attId).single();
  const ctx = await getSeries(att.series_id);
  const addr = needContract(ctx);
  const { att: updated } = await addSignature(attId, addr, signature, { expectSlot: "VERIFIER" });
  if (!isReady(updated)) return "Tanda tangan tersimpan.";
  const p = updated.payload;
  const tx = await operatorSend(addr, venueSeriesAbi as any, "updateValuation", [BigInt(p.newValuation), updated.evidence_hash, BigInt(Math.floor(Date.parse(updated.deadline) / 1000)), sigsOf(updated)]);
  await markSubmitted(attId, tx);
  await pf.from("series").update({ valuation_idr: p.newValuation, ref_price: p.newRef }).eq("id", att.series_id);
  await audit("platform", "valuation.update", { entity: "series", entityId: att.series_id, after: { tx, ...p } });
  return `Revaluasi berlaku: harga referensi Rp${Number(p.newRef).toLocaleString("id-ID")} untuk transaksi baru.`;
}

// ---------------------------------------------------------------- kepatuhan (CONTROLLER)

export async function setFrozen(seriesId: string, wallet: string, frozen: boolean, actor: string, reason: string) {
  if (reason.trim().length < 5) throw new Error("Tulis alasan");
  const addr = needContract(await getSeries(seriesId));
  const tx = await operatorSend(addr, venueSeriesAbi as any, "setFrozen", [getAddress(wallet), frozen]);
  await audit(actor, frozen ? "compliance.freeze" : "compliance.unfreeze", { entity: "series", entityId: seriesId, detail: { wallet, reason, tx } });
  return frozen ? "Alamat dibekukan." : "Pembekuan dicabut.";
}

/** Pemindahan paksa (putusan, kehilangan akses). Penerima wajib terverifikasi; event on-chain memuat kode alasan. */
export async function forcedTransfer(seriesId: string, from: string, to: string, tokens: number, actor: string, reason: string) {
  if (reason.trim().length < 10) throw new Error("Tulis dasar hukum/alasan (minimal 10 karakter)");
  const addr = needContract(await getSeries(seriesId));
  const tx = await operatorSend(addr, venueSeriesAbi as any, "forcedTransfer", [getAddress(from), getAddress(to), BigInt(tokens), evidenceHashOf(reason)]);
  await audit(actor, "compliance.forced_transfer", { entity: "series", entityId: seriesId, detail: { from, to, tokens, reason, tx } });
  return "Pemindahan paksa tercatat on-chain dengan kode alasan.";
}

// ---------------------------------------------------------------- demo §6.8: "platform curang ditolak"

export interface CheatResult { id: string; title: string; how: string; result: { ok: true } | { ok: false; error: string } }

/**
 * Setiap skenario adalah percobaan NYATA dari wallet backend platform (yang memegang CONTROLLER dan slot PLATFORM),
 * disimulasikan ke node Sepolia tanpa dikirim. Yang menolak adalah kontrak, bukan aplikasi.
 */
export async function runCheats(seriesId: string): Promise<CheatResult[]> {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const info = await readSeries(addr);
  const out: CheatResult[] = [];
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const try_ = (fn: string, args: unknown[], abi: any = venueSeriesAbi, to: Address = addr) => operatorTry(to, abi, fn, args);

  // 1) alokasi tanpa tanda tangan investor: platform menandatangani sendiri pesanan atas nama investor
  const victim = privateKeyToAccount(generatePrivateKey());
  const order = { investor: victim.address, tokens: 10n, paidIdr: 10n * info.refPriceIdr, orderId: BigInt(Date.now()), deadline };
  const forged = await platformSignTyped({ domain: seriesDomain(addr), types: orderTypes, primaryType: "Order", message: order });
  out.push({ id: "no-investor-sig", title: "Alokasi token tanpa tanda tangan investor", how: "Platform menandatangani sendiri pesanan atas nama alamat investor", result: await try_("allocate", [[order], [forged], evidenceHashOf("fake")]) });

  // 2) nominal salah: investor (alamat uji) menandatangani pesanan yang dibayar kurang dari token × harga referensi
  const cheap = { ...order, paidIdr: order.paidIdr - 1n, orderId: order.orderId + 1n };
  const cheapSig = await victim.signTypedData({ domain: seriesDomain(addr), types: orderTypes, primaryType: "Order", message: cheap });
  out.push({ id: "wrong-price", title: "Token dialokasikan dengan nominal salah", how: `Dibayar Rp${(order.paidIdr - 1n).toLocaleString("id-ID")} untuk 10 token (seharusnya Rp${order.paidIdr.toLocaleString("id-ID")})`, result: await try_("allocate", [[cheap], [cheapSig], evidenceHashOf("fake")]) });

  // 3) transfer antar investor (ERC-20 langsung)
  out.push({ id: "p2p-transfer", title: "Transfer token antar investor", how: "Memanggil transfer() ERC-20 langsung", result: await operatorTry(info.token, seriesTokenAbi as any, "transfer", [victim.address, 1n]) });

  // 4) biaya operasional di atas plafon
  const nextId = info.lastPeriodId + 1n;
  const end = BigInt(Math.floor(Date.now() / 1000) - 60);
  const gross = 52_000_000n;
  const badOpex = toChainWaterfall({ gross: 52_000_000, refunds: 0, opex: Number((gross * BigInt(info.params.maxOpexBps)) / 10_000n) + 1, tax: 0, operatorFee: 0, reserve: 0, platformFee: 0 });
  out.push({ id: "opex-cap", title: `Biaya operasional melebihi plafon ${info.params.maxOpexBps / 100}%`, how: "Owner menggelembungkan biaya supaya jatah investor mengecil", result: await try_("postRevenuePeriod", [nextId, end, badOpex, evidenceHashOf("x"), deadline, []]) });

  // 5) laba bulanan tanpa owner: hanya tanda tangan PLATFORM
  const w = toChainWaterfall({ gross: 52_000_000, refunds: 1_000_000, opex: 27_000_000, tax: 1_500_000, operatorFee: 4_000_000, reserve: 2_000_000, platformFee: 1_500_000 });
  const fakeAtt = { kind: "REVENUE_PERIOD", ref_id: String(nextId), payload_hash: evidenceHashOf("payload"), deadline: new Date(Number(deadline) * 1000).toISOString() };
  const platformOnly = await platformSignTyped(typedDataOf(fakeAtt, addr) as any);
  out.push({ id: "no-owner", title: "Angka laba bulanan tanpa persetujuan owner", how: "Hanya tanda tangan platform (1 dari 3)", result: await try_("postRevenuePeriod", [nextId, end, w, evidenceHashOf("x"), deadline, [platformOnly]]) });
  out.push({ id: "platform-twice", title: "Platform menandatangani dua kali", how: "Tanda tangan platform yang sama dikirim dua kali sebagai '2 dari 3'", result: await try_("postRevenuePeriod", [nextId, end, w, evidenceHashOf("x"), deadline, [platformOnly, platformOnly]]) });

  // 6) posting ulang periode yang sudah ada / bayar jatah melebihi kewajiban
  if (info.lastPeriodId > 0n) {
    out.push({ id: "repost", title: "Posting ulang periode yang sudah diposting", how: `Periode ${info.lastPeriodId} dikirim lagi`, result: await try_("postRevenuePeriod", [info.lastPeriodId, end, w, evidenceHashOf("x"), deadline, [platformOnly]]) });
    out.push({ id: "overpay", title: "Mencatat pembayaran jatah melebihi kewajiban", how: "settlePayout dengan nominal sangat besar", result: await try_("settlePayout", [info.lastPeriodId, 10n ** 15n, evidenceHashOf("x")]) });
  }
  return out;
}
