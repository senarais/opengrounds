import { CopyText } from "./CopyText";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * "Paspor kepercayaan": tiga cap = tiga penandatangan terdaftar di kontrak attestation. Cap tercetak hanya untuk wallet yang
 * benar-benar menandatangani attestation yang dikirim on-chain. Cap ke-3 (independen) wajib ada untuk persetujuan.
 */
export function TrustPassport({ signers, signed, valid, txUrl, evidenceRoot, gateway, hashOk }: {
  signers: string[]; signed: string[]; valid: boolean; txUrl: string | null; evidenceRoot: string | null; gateway: "pos" | "connector" | "self_reported"; hashOk: boolean;
}) {
  const has = (a: string) => signed.some((s) => s.toLowerCase() === a.toLowerCase());
  const labels = ["Tim · Signer 1", "Tim · Signer 2", "Independen · Signer 3"];
  return (
    <div className="passport">
      <div className="row between" style={{ position: "relative" }}>
        <div>
          <div className="eyebrow">Paspor kepercayaan</div>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 19, fontWeight: 600 }}>{valid ? "Attestation valid" : "Belum ada attestation valid"}</div>
        </div>
        <span className={`badge ${gateway === "pos" ? "ok" : "warn"}`}>{gateway === "pos" ? "omzet terverifikasi gateway" : gateway === "connector" ? "data sistem eksternal" : "omzet dilaporkan owner"}</span>
      </div>
      <div className="stamps">
        {signers.slice(0, 3).map((a, i) => (
          <div key={a} className={`stamp ${has(a) ? "on" : ""} ${i === 2 ? "indep" : ""}`} title={a}>
            <div>{has(a) ? "✓ DISETUJUI" : "belum"}<br />{labels[i]}<br /><span className="mono" style={{ fontSize: 9 }}>{short(a)}</span></div>
          </div>
        ))}
      </div>
      <div className="stack small" style={{ ["--gap" as any]: "8px", position: "relative" }}>
        {evidenceRoot && <div><span className="muted">Evidence root (hash bukti)</span><CopyText value={evidenceRoot} /></div>}
        <div className="row between">
          {txUrl ? <a href={txUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>Lihat transaksi attestation ↗</a> : <span className="muted">Belum dikirim on-chain</span>}
          <span className={`badge ${hashOk ? "ok" : "warn"}`}>{hashOk ? "isi halaman = yang diverifikasi" : "hash halaman belum terikat"}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>Persetujuan sah butuh 2 tanda tangan dan salah satunya wajib pihak independen; satu penandatangan mana pun bisa mencabut (veto).</p>
      </div>
    </div>
  );
}
