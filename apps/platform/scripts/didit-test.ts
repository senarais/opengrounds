import assert from "node:assert/strict";
import { createSession, diditConfig, getDecision } from "../lib/didit";

async function main() {
  delete process.env.DIDIT_API_KEY; delete process.env.DIDIT_WORKFLOW_ID;
  assert.equal(diditConfig().configured, false);
  await assert.rejects(createSession({ vendorData: "u1", callback: "http://x/cb" }), /belum dikonfigurasi/);

  process.env.DIDIT_API_KEY = "k_test"; process.env.DIDIT_WORKFLOW_ID = "wf_1";
  assert.equal(diditConfig().configured, true);
  let seen: any;
  const f = (async (url: any, init: any) => { seen = { url, init }; return new Response(JSON.stringify({ session_id: "s_1", url: "https://verify.didit.me/s_1", status: "Not Started" }), { status: 201 }); }) as typeof fetch;
  const s = await createSession({ vendorData: "u1", callback: "http://localhost:3000/portfolio?kyc=return" }, f);
  assert.equal(s.session_id, "s_1");
  assert.equal(seen.url, "https://verification.didit.me/v3/session/");
  assert.equal(seen.init.headers["x-api-key"], "k_test");
  assert.deepEqual(JSON.parse(seen.init.body), { workflow_id: "wf_1", vendor_data: "u1", callback: "http://localhost:3000/portfolio?kyc=return" });

  const d = (async (url: any) => { seen = { url }; return new Response(JSON.stringify({ session_id: "s_1", status: "Approved", vendor_data: "u1" }), { status: 200 }); }) as typeof fetch;
  assert.equal((await getDecision("s_1", d)).status, "Approved");
  assert.equal(seen.url, "https://verification.didit.me/v3/session/s_1/decision/");

  const bad = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  await assert.rejects(getDecision("s_1", bad), /Didit 401/);
  console.log("klien Didit OK (fetch palsu; BELUM diuji ke Didit asli)");
}
main().catch((e) => { console.error(e); process.exit(1); });
