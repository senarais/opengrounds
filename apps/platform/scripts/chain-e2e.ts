/**
 * Uji TS ↔ kontrak di anvil lokal (tanpa Supabase): memakai kode produksi yang sama (lib/chain, lib/eip712, lib/operator).
 * Membuktikan tanda tangan EIP-712, payload hash, activate, allocate, posting periode, settlePayout, jual balik, dan penolakan kecurangan.
 * Jalankan: anvil (terminal lain) lalu `pnpm --filter @venue-rwa/platform chain:e2e`.
 */
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const K = ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdb18d3a", "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"] as Hex[];
process.env.CHAIN_ID = "31337";
process.env.SEPOLIA_RPC_URL = process.env.ANVIL_URL ?? "http://127.0.0.1:8545";
process.env.OPERATOR_PRIVATE_KEY = K[0];
const [operator, verifier, owner, investor] = K.map((k) => privateKeyToAccount(k));

const ok = (m: string) => console.log("✓ " + m);
async function rpc(method: string, params: unknown[] = []) {
  const r = await fetch(process.env.SEPOLIA_RPC_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}

async function main() {
  const abi = await import("../lib/abi");
  const op = await import("../lib/operator");
  const chain = await import("../lib/chain");
  const eip = await import("../lib/eip712");
  const eco = await import("@venue-rwa/shared");
  const P = eco.DEMO_PARAMS;

  // 1) registry + seri
  const reg = await op.operatorDeploy(abi.attestationRegistryAbi as any, abi.attestationRegistryBytecode as Hex, [operator!.address, operator!.address, verifier!.address]);
  process.env.REGISTRY_ADDRESS = reg.address;
  const v = eco.valuation({ assetValue: 2_400_000_000, d12: 180_000_000, requiredYieldBps: P.requiredYieldBps, stakeBps: eco.EXAMPLE_STAKE_BPS, tokenPrice: P.tokenPrice, yieldMinBps: P.yieldMinBps, yieldMaxBps: P.yieldMaxBps });
  const s = await op.operatorDeploy(abi.venueSeriesAbi as any, abi.venueSeriesBytecode as Hex, [operator!.address, operator!.address, reg.address, operator!.address, "Grounds Uji", "GUJI", {
    stakeBps: eco.EXAMPLE_STAKE_BPS, spvFeeBps: P.spvFeeBps, maxOpexBps: P.maxOpexBps, sellbackDiscountBps: P.sellbackDiscountBps, maxHoldingBps: P.maxHoldingBps,
    lockPeriod: P.lockSeconds, payoutWindow: 3600, defaultGrace: 3600, ownerSignWindow: 3600,
  }]);
  await op.operatorSend(reg.address, abi.attestationRegistryAbi as any, "registerSeries", [s.address, owner!.address]);
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "markVerified", [eip.evidenceHashOf("kyb")]);
  ok(`registry ${reg.address.slice(0, 10)}… seri ${s.address.slice(0, 10)}… (V ${v.v}, N ${v.supply})`);

  const sign = async (who: typeof owner, kind: "ACQUISITION_CLOSED" | "REVENUE_PERIOD" | "VALUATION_UPDATE", refId: number, payloadHash: Hex, deadline: bigint) =>
    who!.signTypedData({ domain: eip.registryDomain(), types: eip.attestationTypes, primaryType: "Attestation", message: eip.attMessage(kind, s.address, refId, payloadHash, deadline) as any });
  const platformSig = (kind: any, refId: number, payloadHash: Hex, deadline: bigint) => op.platformSignTyped({ domain: eip.registryDomain(), types: eip.attestationTypes, primaryType: "Attestation", message: eip.attMessage(kind, s.address, refId, payloadHash, deadline) as any });
  const now = () => BigInt(Math.floor(Date.now() / 1000));

  // 2) ACQUISITION_CLOSED: platform + owner
  const ev = eip.evidenceHashOf("profil");
  const accPayload = eip.acquisitionPayload({ valuation: BigInt(v.v), supply: BigInt(v.supply), refPrice: BigInt(v.refPrice), stakeBps: eco.EXAMPLE_STAKE_BPS, spvFeeBps: P.spvFeeBps, evidenceHash: ev });
  const dl = now() + 3600n;
  await assert.rejects(op.operatorSend(s.address, abi.venueSeriesAbi as any, "activate", [BigInt(v.v), BigInt(v.supply), BigInt(v.refPrice), ev, dl, [await platformSig("ACQUISITION_CLOSED", 0, accPayload, dl)]]), /NotEnoughSignatures|tanda tangan|Enough/i);
  ok("activate dengan satu tanda tangan (platform saja) ditolak");
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "activate", [BigInt(v.v), BigInt(v.supply), BigInt(v.refPrice), ev, dl, [await platformSig("ACQUISITION_CLOSED", 0, accPayload, dl), await sign(owner, "ACQUISITION_CLOSED", 0, accPayload, dl)]]);
  let info = await chain.readSeries(s.address);
  assert.equal(info.state, "Active"); assert.equal(info.treasuryBalance, BigInt(v.supply));
  ok("activate dengan platform + owner: Active, supply dicetak ke treasury");

  // 3) pesanan investor (Privy di produksi; di sini kunci lokal) → allocate
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "setVerified", [investor!.address, true]);
  const tokens = 1000n;
  const order = { investor: investor!.address, tokens, paidIdr: tokens * info.refPriceIdr, orderId: 1n, deadline: now() + 3600n };
  const osig = await investor!.signTypedData({ domain: eip.seriesDomain(s.address), types: eip.orderTypes, primaryType: "Order", message: order });
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "allocate", [[order], [osig], eip.evidenceHashOf("psp")]);
  const h = await chain.readHolder(s.address, info.token, investor!.address);
  assert.equal(h.balance, tokens); assert.equal(h.unlocked, 0n);
  ok("allocate dengan pesanan bertanda tangan investor: 1.000 token, lot terkunci");

  // 4) periode: contoh PRD §4.6 → jatah 73,5/token
  const w = { gross: 52_000_000, refunds: 1_000_000, opex: 27_000_000, tax: 1_500_000, operatorFee: 4_000_000, reserve: 2_000_000, platformFee: 1_500_000 };
  const periodEnd = now() - 60n;
  const perEv = eip.evidenceHashOf("period1");
  const perPayload = eip.periodPayload(1, periodEnd, w, perEv);
  const pdl = now() + 3600n;
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "postRevenuePeriod", [1n, periodEnd, eip.toChainWaterfall(w), perEv, pdl, [await platformSig("REVENUE_PERIOD", 1, perPayload, pdl), await sign(owner, "REVENUE_PERIOD", 1, perPayload, pdl)]]);
  const per = await chain.readPeriod(s.address, 1);
  const r = eco.waterfall(w, eco.EXAMPLE_STAKE_BPS, P.spvFeeBps);
  assert.equal(per.distributable, BigInt(r.distributable)); assert.equal(per.poolInvestors, BigInt(r.pInv));
  assert.equal(per.owedIdr, eco.periodObligation(tokens, per.deltaE18));
  ok(`periode 1 diposting: D ${per.distributable}, P_inv ${per.poolInvestors}, kewajiban ${per.owedIdr} (cocok dengan economics.ts)`);
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "settlePayout", [1n, per.owedIdr, eip.evidenceHashOf("root")]);
  assert.equal((await chain.readPeriod(s.address, 1)).settled, true);
  ok("settlePayout menutup kewajiban");

  // 5) kecurangan ditolak (kontrak yang menjawab)
  const admin = await import("../lib/flows/admin").catch(() => null);
  void admin; // runCheats butuh DB (getSeries); cek inti dilakukan langsung di bawah
  const bad = await op.operatorTry(s.address, abi.venueSeriesAbi as any, "settlePayout", [1n, 10n ** 15n, eip.evidenceHashOf("x")]);
  assert.equal(bad.ok, false); ok("settlePayout melebihi kewajiban ditolak: " + (bad as any).error);
  const p2p = await op.operatorTry(info.token, abi.seriesTokenAbi as any, "transfer", [owner!.address, 1n]);
  assert.equal(p2p.ok, false); ok("transfer ERC-20 langsung ditolak");

  // 6) jual balik setelah kunci lot lewat
  await rpc("evm_increaseTime", [P.lockSeconds + 5]); await rpc("evm_mine");
  const h2 = await chain.readHolder(s.address, info.token, investor!.address);
  assert.equal(h2.unlocked, tokens);
  const sb = { holder: investor!.address, tokens: 100n, paidIdr: eco.sellbackAmount(100, Number(info.refPriceIdr), 0) as unknown as bigint, requestId: 1n, deadline: now() + 7200n };
  const sbm = { ...sb, paidIdr: BigInt(eco.sellbackAmount(100, Number(info.refPriceIdr), 0)), deadline: BigInt(Number((await (await fetch(process.env.SEPOLIA_RPC_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }) })).json()).result.timestamp) + 3600) };
  const sbsig = await investor!.signTypedData({ domain: eip.seriesDomain(s.address), types: eip.sellBackTypes, primaryType: "SellBack", message: sbm });
  await op.operatorSend(s.address, abi.venueSeriesAbi as any, "executeSellBack", [sbm, sbsig, eip.evidenceHashOf("buyback")]);
  assert.equal((await chain.readHolder(s.address, info.token, investor!.address)).balance, tokens - 100n);
  ok("jual balik 100 token setelah lot terbuka: token kembali ke treasury (tanpa burn)");

  info = await chain.readSeries(s.address);
  assert.equal(info.supply, BigInt(v.supply));
  ok("supply tetap " + info.supply);
  console.log("\nSemua pemeriksaan TS ↔ kontrak lulus.");
}
main().catch((e) => { console.error("✗", e?.shortMessage ?? e); process.exit(1); });
