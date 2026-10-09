"use client";
import { useState } from "react";
import styles from "./VenueGallery.module.css";

export function VenueGallery({ photos, loadError }: { photos: { id: string; url: string | null; label: string; reference?: { source: string; author: string; license: string; licenseUrl: string } }[]; loadError: boolean }) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const photo = photos[selected] ?? photos[0];
  return <div className={styles.gallery}>
    <div className={styles.header}><h3>Foto pengajuan</h3><span className="small muted">{photos.length} foto</span></div>
    <p className="small muted">Dikirim oleh pengaju. Foto perlu dicocokkan dengan dokumen dan kondisi venue; unggahan tidak berarti sudah diverifikasi.</p>
    {!photo ? <div className={styles.empty}>{loadError ? "Foto belum bisa dimuat. Coba muat ulang halaman." : "Belum ada foto venue yang diunggah. Pengaju perlu melengkapi foto lapangan dan fasilitas."}</div> : <>
      <figure className={styles.figure}>
        {photo.url && failed !== photo.url ? <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Buka ukuran penuh: ${photo.label}`}><img src={photo.url} alt={photo.label} onError={() => setFailed(photo.url)} /></a> : <div className={styles.empty}>Foto tidak bisa dimuat. Muat ulang halaman untuk memperbarui akses.</div>}
        <figcaption className="small">{photo.label} · {selected + 1} / {photos.length}{photo.reference && <div><b>Ilustrasi demo dari luar — bukan foto venue ini.</b> <a href={photo.reference.source} target="_blank" rel="noreferrer">{photo.reference.author}</a> · <a href={photo.reference.licenseUrl} target="_blank" rel="noreferrer">{photo.reference.license}</a> · tanpa perubahan.</div>}</figcaption>
      </figure>
      {photos.length > 1 && <div className={styles.thumbnails} aria-label="Pilih foto venue">{photos.map((p, i) => <button key={p.id} type="button" aria-pressed={i === selected} onClick={() => setSelected(i)}>{p.url ? <img src={p.url} alt={p.label} loading="lazy" /> : <span>{p.label}</span>}</button>)}</div>}
    </>}
  </div>;
}
