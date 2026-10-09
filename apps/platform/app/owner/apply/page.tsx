import { PageHeader } from "@venue-rwa/ui";
import { ApplyForm } from "@/components/ApplyForm";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  await requireOwner("/owner/apply");
  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <PageHeader eyebrow="Untuk owner" title="Ajukan penjualan omzet" lead="Isi data perusahaan dan penawaran. Verifikasi berjalan otomatis (aturan deterministik), lalu 3 penandatangan manusia memeriksa dan menyetujui. Setelah disetujui, Anda mendapat token seri perusahaan dan akun PoS." />
      <ApplyForm />
    </div>
  );
}
