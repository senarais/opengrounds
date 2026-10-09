import { hhmm, sessionsFor } from "@venue-rwa/shared";
import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { canManage, requireSession } from "@/lib/session";
import { rp } from "@/lib/format";
import { createProduct, updateProduct } from "../actions";

export const dynamic = "force-dynamic";
const CATS = ["basket", "futsal", "badminton", "padel", "tenis", "voli", "lainnya"];

function Fields({ p }: { p?: any }) {
  return (
    <div className="stack" style={{ ["--gap" as any]: "12px" }}>
      <div className="form-row">
        <label className="field">Nama produk<input className="input" name="name" defaultValue={p?.name} placeholder="mis. Lapangan Basket A" required /></label>
        <label className="field">Kategori<select className="select" name="category" defaultValue={p?.category ?? "lainnya"}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="form-row">
        <label className="field">Jam buka (WIB)<input className="input" name="open_hour" type="number" min={0} max={23} defaultValue={p?.open_hour ?? 7} /></label>
        <label className="field">Jam tutup (WIB)<input className="input" name="close_hour" type="number" min={1} max={24} defaultValue={p?.close_hour ?? 23} /></label>
        <label className="field">Durasi sesi (menit)<input className="input" name="session_minutes" type="number" min={15} max={480} step={15} defaultValue={p?.session_minutes ?? 60} /></label>
      </div>
      <div className="form-row">
        <label className="field">Harga per sesi (Rp)<input className="input" name="price" inputMode="numeric" defaultValue={p?.price} placeholder="180000" required /></label>
        <label className="field">Harga peak (opsional)<input className="input" name="peak_price" inputMode="numeric" defaultValue={p?.peak_price ?? ""} placeholder="250000" /></label>
        <label className="field">Peak mulai (jam)<input className="input" name="peak_start_hour" type="number" min={0} max={23} defaultValue={p?.peak_start_hour ?? ""} placeholder="17" /></label>
        <label className="field">Peak sampai (jam)<input className="input" name="peak_end_hour" type="number" min={1} max={24} defaultValue={p?.peak_end_hour ?? ""} placeholder="21" /></label>
      </div>
    </div>
  );
}

export default async function Products({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const { data: products } = await s.db.from("products").select("*").eq("company_id", s.company.id).order("created_at");
  const manage = canManage(s);

  return (
    <>
      <PageHeader eyebrow="Katalog" title="Produk & sesi" lead="Produk adalah yang dibooking pelanggan (lapangan). Setiap produk punya jam buka–tutup dan durasi sesi tetap; sistem membagi rentang itu menjadi Sesi 1, Sesi 2, dan seterusnya." />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid c2">
        {(products ?? []).map((p) => {
          const n = sessionsFor({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes }).length;
          return (
            <Card key={p.id} title={p.name} subtitle={`${p.category} · ${hhmm(p.open_hour * 60)}–${hhmm(p.close_hour * 60)} WIB`} actions={p.active ? <Badge tone="ok">aktif</Badge> : <Badge>nonaktif</Badge>}>
              <div className="grid c3" style={{ ["--gap" as any]: "8px" }}>
                <div><div className="eyebrow">Sesi</div><div className="num" style={{ fontWeight: 750, fontSize: 20 }}>{n} × {p.session_minutes}′</div></div>
                <div><div className="eyebrow">Harga</div><div className="num" style={{ fontWeight: 750, fontSize: 20 }}>{rp(p.price)}</div></div>
                <div><div className="eyebrow">Peak</div><div className="num" style={{ fontWeight: 750, fontSize: 20 }}>{p.peak_price ? rp(p.peak_price) : "–"}</div>{p.peak_price && <div className="small muted">{p.peak_start_hour}:00–{p.peak_end_hour}:00</div>}</div>
              </div>
              {manage && (
                <details className="disclose" style={{ marginTop: 14 }}>
                  <summary>Ubah produk</summary>
                  <div className="body">
                    <form action={updateProduct} className="stack">
                      <input type="hidden" name="id" value={p.id} />
                      <Fields p={p} />
                      <label className="row small"><input type="checkbox" name="active" defaultChecked={p.active} /> Produk aktif (bisa dibooking)</label>
                      <div><button className="btn">Simpan perubahan</button></div>
                    </form>
                  </div>
                </details>
              )}
            </Card>
          );
        })}
        {(products ?? []).length === 0 && <Card><Empty>Belum ada produk.</Empty></Card>}
      </div>

      {manage && (
        <div className="mt">
          <Card tone="accent" title="Tambah produk">
            <form action={createProduct} className="stack"><Fields /><div><button className="btn primary">Tambah produk</button></div></form>
          </Card>
        </div>
      )}
    </>
  );
}
