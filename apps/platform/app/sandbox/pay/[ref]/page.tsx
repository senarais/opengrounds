import { redirect } from "next/navigation";
import { Card, Notice, SimBanner } from "@venue-rwa/ui";
import { onChargePaid } from "@/lib/flows/payments";
import { platformDb } from "@/lib/db";
import { payMockCharge, signMockWebhook } from "@/lib/psp";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox checkout · Open Grounds" };

async function pay(fd: FormData) {
  "use server";
  const ref = String(fd.get("ref")), back = String(fd.get("back") || "/");
  await payMockCharge(ref);
  // webhook bertanda tangan ke endpoint sendiri, sama bentuknya dengan webhook penyedia sungguhan
  const body = JSON.stringify({ ref, status: "PAID" });
  const ts = String(Date.now());
  const base = process.env.PLATFORM_URL ?? "http://localhost:3000";
  await fetch(`${base}/api/payments/mock`, { method: "POST", headers: { "content-type": "application/json", "x-sandbox-timestamp": ts, "x-sandbox-signature": signMockWebhook(body, ts) }, body }).catch(() => onChargePaid(ref));
  let path = "/";
  try { const u = new URL(back, "http://internal.invalid"); path = `${u.pathname}${u.search}`; } catch { /* kembali ke beranda */ }
  redirect(path.startsWith("//") ? "/" : path);
}

export default async function SandboxPay({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ back?: string }> }) {
  const { ref } = await params;
  const sp = await searchParams;
  const { data } = await platformDb().from("mock_charges").select("*").eq("ref", ref).maybeSingle();
  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <SimBanner>SANDBOX · no real payment</SimBanner>
      <Card title="Sandbox checkout" subtitle="Mock payment provider · signed test webhook">
        {!data ? <Notice tone="bad">Payment request not found.</Notice> : data.status === "paid" ? <Notice tone="ok">Payment received.</Notice> : (
          <form action={pay} className="stack">
            <div className="big-amount">{rp(Number(data.amount))}</div>
            <p className="small">{data.description}</p>
            <input type="hidden" name="ref" value={ref} /><input type="hidden" name="back" value={sp.back ?? "/"} />
            <button className="btn primary lg">Complete simulated payment</button>
          </form>
        )}
      </Card>
    </div>
  );
}
