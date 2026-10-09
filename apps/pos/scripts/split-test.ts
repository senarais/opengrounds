import assert from "node:assert/strict";
import { createSplitRule, splitRuleBody } from "../lib/psp";

async function main() {
  process.env.XENDIT_SECRET_KEY = "xnd_test_dummy";
  // bentuk body
  const b = splitRuleBody({ name: "Investor Padel", percent: 10, destinationAccountId: "acc_1", reference: "series-1" });
  assert.deepEqual(b.routes[0], { percent_amount: 10, currency: "IDR", destination_account_id: "acc_1", reference_id: "series-1" });
  assert.throws(() => splitRuleBody({ name: "x", percent: 0, destinationAccountId: "a", reference: "r" }));
  assert.throws(() => splitRuleBody({ name: "x", percent: 101, destinationAccountId: "a", reference: "r" }));
  // dimatikan secara default
  delete process.env.XENDIT_SPLIT;
  await assert.rejects(createSplitRule({ name: "x", percent: 10, destinationAccountId: "a", reference: "r" }), /dimatikan/);
  // fetch palsu: sukses dan galat
  process.env.XENDIT_SPLIT = "on";
  let seen: any;
  const ok = (async (url: any, init: any) => { seen = { url, init }; return new Response(JSON.stringify({ id: "splt_123" }), { status: 200 }); }) as typeof fetch;
  assert.equal(await createSplitRule({ name: "x", percent: 10, destinationAccountId: "a", reference: "r" }, ok), "splt_123");
  assert.equal(seen.url, "https://api.xendit.co/split_rules");
  assert.match(seen.init.headers.Authorization, /^Basic /);
  const bad = (async () => new Response(JSON.stringify({ error_code: "INVALID_CREDENTIALS" }), { status: 403 })) as typeof fetch;
  await assert.rejects(createSplitRule({ name: "x", percent: 10, destinationAccountId: "a", reference: "r" }, bad), /403.*INVALID_CREDENTIALS/);
  console.log("split adapter OK (fetch palsu; BELUM diuji ke Xendit)");
}
main().catch((e) => { console.error(e); process.exit(1); });
