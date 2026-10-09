import { Notice, PageHeader } from "@venue-rwa/ui";
import { ApplyForm } from "@/components/ApplyForm";
import { requireArea } from "@/lib/auth";
import { submitForOwner } from "./actions";

export const metadata = { title: "Ajukan venue atas nama owner" };

export default async function SpvApply({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireArea("spv");
  const sp = await searchParams;
  return (
    <div className="container">
      <PageHeader eyebrow="Grounds (SPV)" title="Ajukan venue atas nama owner" lead="Isi data venue yang ingin Grounds beli haknya. Pemilik venue tetap harus punya akun owner dan menandatangani akuisisi dengan walletnya sendiri." />
      <Notice tone="warn" title="Persetujuan owner tetap wajib.">Pengajuan ini lewat KYB seperti biasa. Token baru terbit setelah reviewer menyetujui, SPV menyetujui pembelian, dan owner (penjual) menandatangani.</Notice>
      <div className="mt"><ApplyForm action={submitForOwner} error={sp.err} withOwnerEmail /></div>
    </div>
  );
}
