import { OnboardingInput } from "@venue-rwa/shared";
import { DOC_KINDS, type DocKindAll } from "./onboarding";
import { readSales } from "../sales";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const json = (v: FormDataEntryValue | null) => { try { return JSON.parse(String(v ?? "[]")); } catch { return []; } };

/** Ubah isian ApplyForm (FormData) menjadi data tervalidasi + berkas. Dipakai pengajuan oleh owner dan oleh Grounds (SPV) atas nama owner. */
export async function buildApplication(fd: FormData): Promise<{ input: OnboardingInput; files: { kind: DocKindAll; file: File }[] }> {
    const sales = fd.get("sales_data");
    if (!(sales instanceof File) || sales.size === 0) throw new Error("File data penjualan wajib diunggah");
    const parsed = await readSales(sales);
    if (parsed.errors.length) throw new Error("Data penjualan: " + parsed.errors.join("; "));
    const facilities = json(fd.get("facilities"));
    const input = OnboardingInput.parse({
      company: {
        legalName: fd.get("legalName"), nib: fd.get("nib"), npwp: fd.get("npwp"), deedNumber: fd.get("deedNumber"), deedDate: fd.get("deedDate"), registeredAddress: fd.get("registeredAddress"),
        kbli: fd.get("kbli"), directors: json(fd.get("directors")), commissioners: json(fd.get("commissioners")), signatoryName: fd.get("signatoryName"), signatoryTitle: fd.get("signatoryTitle"),
        contactEmail: fd.get("contactEmail"), contactPhone: fd.get("contactPhone"),
      },
      beneficialOwners: json(fd.get("owners")),
      venue: {
        name: fd.get("venueName"), address: fd.get("address"), city: fd.get("city"), province: fd.get("province"), lat: num(fd.get("lat")), lng: num(fd.get("lng")),
        sports: [...new Set(facilities.map((f: any) => f.sport))], openHour: num(fd.get("openHour")), closeHour: num(fd.get("closeHour")), operatingSince: fd.get("operatingSince"), facilities,
      },
      land: {
        owned: fd.get("landOwned") === "on", rightType: fd.get("rightType"), certificateNumber: fd.get("certificateNumber"), holderName: fd.get("holderName"),
        encumbered: fd.get("encumbered") === "on", encumbranceConsent: fd.get("encumbranceConsent") === "on", permits: String(fd.get("permits") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        assetValue: num(fd.get("assetValue")),
      },
      financials: parsed.months,
      debt: { outstanding: num(fd.get("debtOutstanding")) ?? 0, monthlyInstallment: num(fd.get("debtInstallment")) ?? 0, lender: String(fd.get("debtLender") ?? ""), covenantRestricts: fd.get("covenantRestricts") === "on" },
      offering: { stakeBps: num(fd.get("stakeBps")), useOfFunds: fd.get("useOfFunds") },
      payout: { bank: fd.get("bank"), accountName: fd.get("accountName"), accountNumber: fd.get("accountNumber") },
      integrations: { gatewayOnly: fd.get("gatewayOnly") === "on", bankDataAccess: fd.get("bankDataAccess") === "on" },
      consent: { dataProcessing: fd.get("dataProcessing") === "on", truthful: fd.get("truthful") === "on" },
    });
    const files: { kind: DocKindAll; file: File }[] = [];
    for (const kind of DOC_KINDS) for (const f of fd.getAll(`doc_${kind}`)) if (f instanceof File && f.size > 0) files.push({ kind, file: f });
    files.push({ kind: "sales_data", file: sales });
  return { input, files };
}
