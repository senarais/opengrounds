import { SCORE_HINTS } from "@venue-rwa/verification";
import { rp } from "@/lib/format";

interface Comp { id: string; label: string; points: number; max: number; detail: string }
const n = (x: number) => x.toLocaleString("id-ID");
const Hl = ({ children }: { children: React.ReactNode }) => <mark className="hl">{children}</mark>;

/**
 * Ringkasan untuk reviewer: kenapa skornya segitu dan apa intinya. Disusun deterministik dari hasil policy engine
 * (komponen skor, gerbang, peringatan, harga); bukan keluaran AI.
 */
export function RunSummary({ run, g, proposedPrice, dataSource }: { run: any; g: any; proposedPrice: number; dataSource: string }) {
  const comps = (g.components ?? []) as Comp[];
  const gates = (g.gates ?? []) as { pass: boolean; label: string }[];
  const warnings = (g.warnings ?? []) as string[];
  const pass = run.recommendation === "pass";
  const failedGates = gates.filter((x) => !x.pass);
  const full = comps.filter((c) => c.points >= c.max);
  const lost = comps.filter((c) => c.points < c.max).sort((a, b) => b.max - b.points - (a.max - a.points));
  const lostTotal = lost.reduce((a, c) => a + (c.max - c.points), 0);
  const ref = Number(run.reference_price), max = Number(run.max_price);
  const over = ref > 0 ? proposedPrice / ref - 1 : 0;
  const band = over <= 0.1 ? "auto" : over <= 0.25 ? "reviewer" : "ditolak";
  const selfReported = dataSource === "self_reported";

  return (
    <section className="sect summary" aria-labelledby="ringkasan" style={{ marginTop: 28 }}>
      <h2 id="ringkasan">Ringkasan untuk reviewer</h2>
      <ul className="points">
        <li>
          <b>Kesimpulan:</b> {pass ? <>sistem <Hl>merekomendasikan lolos</Hl></> : <>sistem <Hl>merekomendasikan tidak lolos</Hl></>} dengan skor <Hl>{n(run.score)} dari 10.000</Hl> (ambang 6.000), {gates.length - failedGates.length} dari {gates.length} gerbang lolos
          {failedGates.length > 0 && <>; yang gagal: <Hl>{failedGates.map((x) => x.label).join(", ")}</Hl></>}.
        </li>
        <li>
          <b>Kenapa {n(run.score)}:</b> {full.length > 0 && <>poin penuh di {full.map((c, i) => <span key={c.id}>{i > 0 && ", "}{c.label.toLowerCase()} ({c.detail})</span>)}. </>}
          {lost.length > 0 ? <>Selisih <Hl>{n(lostTotal)} poin</Hl> berasal dari {lost.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Hl>{c.label.toLowerCase()}</Hl> ({c.detail}; dapat {n(c.points)} dari {n(c.max)})</span>)}.</> : <>Tidak ada poin yang hilang.</>}
        </li>
        {lost.map((c) => (
          <li key={`l-${c.id}`}>
            <b>Cara naik di {c.label.toLowerCase()}:</b> poin penuh bila {SCORE_HINTS[c.id]?.full ?? "sesuai rumus"}; sekarang {c.detail}. {SCORE_HINTS[c.id]?.how}
          </li>
        ))}
        <li>
          <b>Harga:</b> diajukan <Hl>{rp(proposedPrice)}</Hl> per token, referensi sistem {rp(ref)}, batas maksimal {rp(max)}. {over < 0 ? <>Harga <Hl>di bawah referensi</Hl> ({(over * 100).toFixed(1)}%): boleh, dengan peringatan.</> : band === "auto" ? <>Selisih +{(over * 100).toFixed(1)}% ada di pita <Hl>otomatis</Hl> (≤ +10%).</> : band === "reviewer" ? <>Selisih +{(over * 100).toFixed(1)}% ada di pita <Hl>butuh reviewer</Hl> (+10% sampai +25%).</> : <>Selisih +{(over * 100).toFixed(1)}% melewati +25%: <Hl>ditolak</Hl>.</>}
          {selfReported && <> Data omzet dilaporkan owner, jadi harga referensi dipotong haircut 35%.</>}
        </li>
        <li>
          <b>Yang perlu Anda nilai sendiri:</b> {warnings.length > 0 ? <><Hl>{warnings.length} peringatan</Hl> tidak menggagalkan otomatis tetapi butuh penilaian (daftar di bawah).</> : "tidak ada peringatan."}
          {selfReported && <> Omzet belum dicocokkan dengan settlement gateway; rilis dana tahap 2 menunggu rekonsiliasi.</>}
        </li>
      </ul>
    </section>
  );
}
