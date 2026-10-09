import { redirect } from "next/navigation";
import { Card, Notice, SimBanner } from "@venue-rwa/ui";
import { onChargePaid } from "@/lib/flows/payments";
import { platformDb } from "@/lib/db";
import { payMockCharge, signMockWebhook } from "@/lib/psp";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";

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
      <SimBanner>SANDBOX · bukan pembayaran sungguhan</SimBanner>
      <Card title="Halaman bayar sandbox" subtitle="MockPaymentProvider: webhook bertanda tangan, format sama seperti penyedia asli">
        {!data ? <Notice tone="bad">Tagihan tidak ditemukan.</Notice> : data.status === "paid" ? <Notice tone="ok">Sudah dibayar.</Notice> : (
          <form action={pay} className="stack">
            <div className="big-amount">{rp(Number(data.amount))}</div>
            <p className="small">{data.description}</p>
            <input type="hidden" name="ref" value={ref} /><input type="hidden" name="back" value={sp.back ?? "/"} />
            <button className="btn primary lg">Bayar (simulasi)</button>
          </form>
        )}
      </Card>
    </div>
  );
}
