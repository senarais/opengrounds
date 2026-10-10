"use client";
import { useState } from "react";

export function VenueGallery({ photos, loadError }: { photos: { id: string; url: string | null; label: string; reference?: { source: string; author: string; license: string; licenseUrl: string } }[]; loadError: boolean }) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const photo = photos[selected] ?? photos[0];
  return <div className="og-venue-gallery">
    <div className="og-venue-gallery-header"><h3>Submitted venue photos</h3><span className="small muted">{photos.length} photos</span></div>
    <p className="small muted">Submitted by the applicant. Photos are not verified until checked against documents and venue conditions.</p>
    {!photo ? <div className="og-venue-gallery-empty">{loadError ? "Photos could not be loaded. Refresh and try again." : "No venue photos have been submitted."}</div> : <>
      <figure className="og-venue-figure">
        {photo.url && failed !== photo.url ? <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open full-size image: ${photo.label}`}><img src={photo.url} alt={photo.label} onError={() => setFailed(photo.url)} /></a> : <div className="og-venue-gallery-empty">This photo could not be loaded. Refresh to renew access.</div>}
        <figcaption className="small">{photo.label} · {selected + 1} / {photos.length}{photo.reference && <div><b>External demo illustration · not this venue's photo.</b> <a href={photo.reference.source} target="_blank" rel="noreferrer">{photo.reference.author}</a> · <a href={photo.reference.licenseUrl} target="_blank" rel="noreferrer">{photo.reference.license}</a> · unmodified.</div>}</figcaption>
      </figure>
      {photos.length > 1 && <div className="og-venue-thumbnails" aria-label="Choose a venue photo">{photos.map((p, i) => <button key={p.id} type="button" aria-pressed={i === selected} onClick={() => setSelected(i)}>{p.url ? <img src={p.url} alt={p.label} loading="lazy" /> : <span>{p.label}</span>}</button>)}</div>}
    </>}
  </div>;
}
