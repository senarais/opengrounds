import { DEMO_PHOTOS } from "@/lib/demo-photos";
import { platformDb } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { VenueGallery } from "./VenueGallery";
import { CourtDiorama } from "./visual/CourtDiorama";
import type { CourtFacility } from "./visual/CourtScene";

/** Only public venue photos leave the server; private KYB documents are excluded. */
export async function VenueMedia({ venueId, name, area, facilities, openHour, closeHour }: {
  venueId: string; name: string; area: string; facilities: CourtFacility[]; openHour: number; closeHour: number;
}) {
  const { data, error } = await platformDb().from("documents").select("id, storage_path, original_name, uploaded_at").eq("venue_id", venueId).eq("kind", "photo").order("uploaded_at");
  const photos = await Promise.all((data ?? []).map(async (photo, i) => ({ id: photo.id, url: await signedUrl(photo.storage_path, 3600), label: `Foto ${i + 1} · ${name}`, reference: Object.entries(DEMO_PHOTOS).find(([key]) => photo.original_name === `demo-reference-${key}.jpg`)?.[1] })));
  return <section className="mt" aria-label="Foto dan model venue">
    <div className="section-title"><h2>Kenali venue</h2></div>
    <VenueGallery photos={photos} loadError={!!error} />
    <div className="mt">
      <h3>Jelajahi lapangan 3D</h3>
      <p className="small muted" style={{ margin: "6px 0 14px" }}>Ilustrasi berdasarkan jenis dan ukuran lapangan yang diajukan. Tata letak bukan hasil survei; model ini bukan bukti kondisi fisik venue.</p>
      {facilities.length ? <CourtDiorama facilities={facilities} hours={[]} openHour={openHour} closeHour={closeHour} source="illustration" note="Data okupansi per jam belum tersedia." venueName={name} area={area} /> : <p className="small muted">Spesifikasi lapangan belum tersedia untuk membuat model 3D.</p>}
    </div>
  </section>;
}
