/** One-time labelled cash fixture for withdrawal/reinvestment tests; never a revenue distribution. */
import { serviceClient } from "@venue-rwa/shared";
import { chain } from "../lib/chain";
import { audit, moveCash } from "../lib/flow";
import { balanceOf } from "../lib/flows/cash";

async function main() {
  if (process.env.NODE_ENV === "production" || chain.id !== 11155111) throw new Error("Only the Sepolia demo is supported");
  const pf = serviceClient("platform");
  const requested = process.argv.find((a) => a.startsWith("--user="))?.slice(7);
  let query = pf.from("users").select("id").eq("role", "investor");
  if (requested) query = query.eq("id", requested);
  const { data: users, error } = await query;
  if (error || users?.length !== 1) throw new Error("Specify --user=<investor ID> when more than one investor exists");
  const id = users[0]!.id;
  const amount = 100000;
  const ref = `demo-test-balance-v1:${id}`;
  await moveCash(null, ref, [["spv_capital", -amount], ["distribution", amount]]);
  const { error: creditError } = await pf.from("investor_ledger").upsert({ user_id: id, kind: "adjustment", amount, ref }, { onConflict: "kind,ref", ignoreDuplicates: true });
  if (creditError) throw new Error(creditError.message);
  await audit("seed:demo", "investor.demo_balance", { entity: "users", entityId: id, detail: { ref, amount, simulated: true, purpose: "User-requested withdrawal/reinvestment test; not venue revenue" } });
  console.log({ creditedFixture: amount, currentBalance: await balanceOf(id), label: "Saldo uji demo; bukan bagi hasil venue", userId: id });
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
