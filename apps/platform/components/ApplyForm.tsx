"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";
import { LAND_RIGHTS, MAX_STAKE_BPS, MIN_STAKE_BPS, SPORT_OPTIONS, SURFACE_OPTIONS } from "@venue-rwa/shared";
import { SpotlightPanel } from "@/components/SpotlightPanel";

interface Person { name: string; title: string }
interface Owner { fullName: string; ownershipPct: number; idNumber: string }
interface Fac { name: string; sport: string; lengthM: number; widthM: number; surface: string; indoor: boolean; pricePerHour: number }

const STEPS = ["Business", "Ownership & venue", "Land & finances", "Offer & payout", "Documents", "Review"];
const DOCS: { kind: string; label: string; required?: boolean }[] = [
  { kind: "deed", label: "Company deed", required: true }, { kind: "nib", label: "Business ID · NIB", required: true }, { kind: "npwp", label: "Company tax ID · NPWP", required: true },
  { kind: "land_certificate", label: "Land certificate", required: true }, { kind: "bank_statement", label: "Bank statements · 6–12 months", required: true },
  { kind: "financial_report", label: "Financial reports" }, { kind: "permit", label: "Building permits · PBG / SLF" }, { kind: "tax", label: "Tax documents" }, { kind: "debt", label: "Loan agreements, if any" }, { kind: "insurance", label: "Insurance policy" }, { kind: "photo", label: "Venue photos · public" },
];
const SPORT_LABEL: Record<string, string> = { futsal: "Futsal", padel: "Padel", tenis: "Tennis", basket: "Basketball", badminton: "Badminton", voli: "Volleyball", "mini soccer": "Mini soccer", lainnya: "Other" };
const SURFACE_LABEL: Record<string, string> = { "rumput sintetis": "Artificial turf", vinyl: "Vinyl", "parket kayu": "Wood parquet", "semen/beton": "Concrete", karpet: "Carpet", "tanah liat": "Clay", lainnya: "Other" };
const LAND_LABEL: Record<string, string> = { SHM: "Freehold title · Sertifikat Hak Milik", HGB: "Building use title · Hak Guna Bangunan", HGU: "Cultivation title · Hak Guna Usaha", HP: "Right to use · Hak Pakai" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="card og-form-section"><legend>{title}</legend><div className="stack">{children}</div></fieldset>;
}
function Field({ label, children, className = "" }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={`field ${className}`}>{label}{children}</label>;
}

export function ApplyForm({ action, error, withOwnerEmail }: { action: (fd: FormData) => Promise<void>; error?: string; withOwnerEmail?: boolean }) {
  const [step, setStep] = useState(0);
  const [directors, setDirectors] = useState<Person[]>([{ name: "", title: "Director" }]);
  const [commissioners, setCommissioners] = useState<Person[]>([]);
  const [owners, setOwners] = useState<Owner[]>([{ fullName: "", ownershipPct: 100, idNumber: "" }]);
  const [facs, setFacs] = useState<Fac[]>([{ name: "Court 1", sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 150000 }]);
  const [encumbered, setEncumbered] = useState(false);
  const [stake, setStake] = useState(5000);
  const form = useRef<HTMLFormElement>(null);
  const update = <T,>(items: T[], setItems: (next: T[]) => void, index: number, patch: Partial<T>) => setItems(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const next = () => {
    const panel = form.current?.querySelector<HTMLElement>(`[data-wizard-step="${step}"]`);
    const invalid = panel?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(":invalid");
    if (invalid) { invalid.reportValidity(); return; }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  return <form ref={form} action={action} encType="multipart/form-data" className="og-wizard">
    <input type="hidden" name="directors" value={JSON.stringify(directors)} />
    <input type="hidden" name="commissioners" value={JSON.stringify(commissioners.filter((person) => person.name))} />
    <input type="hidden" name="owners" value={JSON.stringify(owners)} />
    <input type="hidden" name="facilities" value={JSON.stringify(facs)} />
    <aside className="og-wizard-rail" aria-label="Application progress">
      <h2>Venue application</h2><p>Complete each step to submit for review.</p>
      <div className="og-wizard-mobile-progress"><span>{step < STEPS.length - 1 ? step + 1 : <Check size={15} aria-hidden="true" />}</span><span>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span><progress value={step + 1} max={STEPS.length} aria-label={`Step ${step + 1} of ${STEPS.length}`} /></div>
      <ol className="og-wizard-progress">{STEPS.map((label, index) => <li key={label}><button type="button" data-current={index === step || undefined} data-complete={index < step || undefined} aria-current={index === step ? "step" : undefined} disabled={index >= step} onClick={() => setStep(index)}><i>{index < step ? <Check size={14} aria-hidden="true" /> : index + 1}</i><span>{label}</span></button></li>)}</ol>
    </aside>

    <div className="og-wizard-panel">
      <SpotlightPanel className="og-wizard-card">
        <div className="og-wizard-heading"><span className="og-kicker">Step {step + 1} of {STEPS.length}</span><h2>{STEPS[step]}</h2><p>Required fields are marked. You can review each section before sending.</p></div>
        {error && <div className="msg err og-wizard-errors" role="alert">{error}</div>}

        <div className="og-wizard-step" data-wizard-step="0" hidden={step !== 0}>
          {withOwnerEmail && <Section title="Owner account"><Field label="Registered owner email"><input className="input" type="email" name="ownerEmail" autoComplete="email" required /></Field></Section>}
          <Section title="Company details">
            <div className="grid c2"><Field label="Legal company name"><input className="input" name="legalName" required minLength={3} /></Field><Field label="Business classification · KBLI"><input className="input" name="kbli" required pattern="\d{5}" inputMode="numeric" placeholder="5 digits" /></Field><Field label="Business ID · NIB"><input className="input" name="nib" required pattern="\d{13}" inputMode="numeric" placeholder="13 digits" /></Field><Field label="Tax ID · NPWP"><input className="input" name="npwp" required pattern="\d{15,16}" inputMode="numeric" placeholder="15 or 16 digits" /></Field><Field label="Deed number"><input className="input" name="deedNumber" required /></Field><Field label="Deed date"><input className="input" type="date" name="deedDate" required /></Field></div>
            <Field label="Registered address"><input className="input" name="registeredAddress" required minLength={10} /></Field>
          </Section>
          <Section title="Signatory & directors">
            <div className="grid c2"><Field label="Authorized signatory"><input className="input" name="signatoryName" required /></Field><Field label="Signatory title"><input className="input" name="signatoryTitle" required /></Field><Field label="Contact email"><input className="input" type="email" name="contactEmail" required /></Field><Field label="Contact phone"><input className="input" name="contactPhone" type="tel" required /></Field></div>
            <div className="og-repeat-list"><div className="og-repeat-heading"><b>Directors</b><button className="og-inline-add" type="button" onClick={() => setDirectors([...directors, { name: "", title: "Director" }])}><Plus size={15} aria-hidden="true" /> Add director</button></div>{directors.map((person, i) => <div className="og-repeat-row" key={i}><input aria-label={`Director ${i + 1} name`} className="input" placeholder="Full name" value={person.name} onChange={(e) => update(directors, setDirectors, i, { name: e.target.value })} required /><input aria-label={`Director ${i + 1} title`} className="input" placeholder="Title" value={person.title} onChange={(e) => update(directors, setDirectors, i, { title: e.target.value })} required />{directors.length > 1 && <button className="og-icon-button" type="button" aria-label={`Remove director ${i + 1}`} onClick={() => setDirectors(directors.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>}</div>)}</div>
            <div className="og-repeat-list"><div className="og-repeat-heading"><b>Commissioners <span className="og-optional">Optional</span></b><button className="og-inline-add" type="button" onClick={() => setCommissioners([...commissioners, { name: "", title: "Commissioner" }])}><Plus size={15} aria-hidden="true" /> Add commissioner</button></div>{commissioners.map((person, i) => <div className="og-repeat-row" key={i}><input aria-label={`Commissioner ${i + 1} name`} className="input" placeholder="Full name" value={person.name} onChange={(e) => update(commissioners, setCommissioners, i, { name: e.target.value })} /><input aria-label={`Commissioner ${i + 1} title`} className="input" placeholder="Title" value={person.title} onChange={(e) => update(commissioners, setCommissioners, i, { title: e.target.value })} /><button className="og-icon-button" type="button" aria-label={`Remove commissioner ${i + 1}`} onClick={() => setCommissioners(commissioners.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button></div>)}</div>
          </Section>
        </div>

        <div className="og-wizard-step" data-wizard-step="1" hidden={step !== 1}>
          <Section title="Beneficial owners · 25% or more">
            {owners.map((owner, i) => <div className="og-repeat-row og-repeat-owner" key={i}><input aria-label={`Beneficial owner ${i + 1} full name`} className="input" placeholder="Full name" value={owner.fullName} onChange={(e) => update(owners, setOwners, i, { fullName: e.target.value })} required /><input aria-label={`Beneficial owner ${i + 1} ownership percentage`} className="input" type="number" min={25} max={100} step="0.01" placeholder="Ownership %" value={owner.ownershipPct} onChange={(e) => update(owners, setOwners, i, { ownershipPct: Number(e.target.value) })} required /><input aria-label={`Beneficial owner ${i + 1} national ID`} className="input" placeholder="National ID · NIK" value={owner.idNumber} onChange={(e) => update(owners, setOwners, i, { idNumber: e.target.value })} required inputMode="numeric" />{owners.length > 1 && <button className="og-icon-button" type="button" aria-label={`Remove beneficial owner ${i + 1}`} onClick={() => setOwners(owners.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>}</div>)}
            {owners.length < 4 && <button className="og-inline-add" type="button" onClick={() => setOwners([...owners, { fullName: "", ownershipPct: 25, idNumber: "" }])}><Plus size={15} aria-hidden="true" /> Add beneficial owner</button>}
          </Section>
          <Section title="Venue details">
            <div className="grid c2"><Field label="Venue name"><input className="input" name="venueName" required /></Field><Field label="Operating since"><input className="input" type="month" name="operatingSince" required /></Field><Field label="City"><input className="input" name="city" required /></Field><Field label="Province"><input className="input" name="province" required /></Field><Field label="Opening hour"><input className="input" type="number" name="openHour" min={0} max={23} defaultValue={7} required /></Field><Field label="Closing hour"><input className="input" type="number" name="closeHour" min={1} max={24} defaultValue={23} required /></Field></div>
            <Field label="Venue address"><input className="input" name="address" minLength={10} required /></Field>
            <div className="grid c2"><Field label="Latitude · optional"><input className="input" name="lat" type="number" step="any" /></Field><Field label="Longitude · optional"><input className="input" name="lng" type="number" step="any" /></Field></div>
            <Field label="Sports at this venue"><input className="input" readOnly value={[...new Set(facs.map((court) => SPORT_LABEL[court.sport.toLowerCase()] ?? court.sport))].join(", ")} /></Field>
          </Section>
          <Section title="Courts & facilities">
            {facs.map((court, i) => <div className="og-facility" key={i}><div className="og-repeat-heading"><b>Facility {i + 1}</b>{facs.length > 1 && <button className="og-icon-button" type="button" aria-label={`Remove facility ${i + 1}`} onClick={() => setFacs(facs.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>}</div><div className="grid c3"><input aria-label={`Facility ${i + 1} name`} className="input" placeholder="Court name" value={court.name} onChange={(e) => update(facs, setFacs, i, { name: e.target.value })} required /><select aria-label={`Facility ${i + 1} sport`} className="select" value={court.sport} onChange={(e) => update(facs, setFacs, i, { sport: e.target.value })}>{SPORT_OPTIONS.map((sport) => <option key={sport} value={sport}>{SPORT_LABEL[sport.toLowerCase()] ?? sport}</option>)}</select><select aria-label={`Facility ${i + 1} surface`} className="select" value={court.surface} onChange={(e) => update(facs, setFacs, i, { surface: e.target.value })}>{SURFACE_OPTIONS.map((surface) => <option key={surface} value={surface}>{SURFACE_LABEL[surface] ?? surface}</option>)}</select><input aria-label={`Facility ${i + 1} length in metres`} className="input" type="number" placeholder="Length · m" value={court.lengthM} onChange={(e) => update(facs, setFacs, i, { lengthM: Number(e.target.value) })} /><input aria-label={`Facility ${i + 1} width in metres`} className="input" type="number" placeholder="Width · m" value={court.widthM} onChange={(e) => update(facs, setFacs, i, { widthM: Number(e.target.value) })} /><input aria-label={`Facility ${i + 1} hourly price`} className="input" type="number" placeholder="Hourly price · Rp" value={court.pricePerHour} onChange={(e) => update(facs, setFacs, i, { pricePerHour: Number(e.target.value) })} /></div><label className="og-check-row"><input type="checkbox" checked={court.indoor} onChange={(e) => update(facs, setFacs, i, { indoor: e.target.checked })} /> Indoor court</label></div>)}
            <button className="og-inline-add" type="button" onClick={() => setFacs([...facs, { name: `Court ${facs.length + 1}`, sport: "futsal", lengthM: 25, widthM: 15, surface: "vinyl", indoor: true, pricePerHour: 150000 }])}><Plus size={15} aria-hidden="true" /> Add facility</button>
          </Section>
        </div>

        <div className="og-wizard-step" data-wizard-step="2" hidden={step !== 2}>
          <Section title="Land ownership">
            <label className="og-check-row"><input type="checkbox" name="landOwned" required /> The venue land is self-owned</label>
            <div className="grid c2"><Field label="Land title"><select className="select" name="rightType">{LAND_RIGHTS.map((right) => <option key={right} value={right}>{LAND_LABEL[right]}</option>)}</select></Field><Field label="Certificate number"><input className="input" name="certificateNumber" required /></Field><Field label="Registered holder"><input className="input" name="holderName" required /></Field><Field label="Estimated asset value · Rp"><input className="input" name="assetValue" type="number" min={1} required /></Field></div>
            <label className="og-check-row"><input type="checkbox" name="encumbered" checked={encumbered} onChange={(e) => setEncumbered(e.target.checked)} /> Land is pledged as collateral</label>
            {encumbered && <label className="og-check-row"><input type="checkbox" name="encumbranceConsent" /> Written lender consent is available</label>}
            <Field label="Permits · comma-separated"><input className="input" name="permits" placeholder="PBG, SLF" /></Field>
          </Section>
          <Section title="Financial history">
            <Field label="Sales data · CSV or XLSX"><input className="input" type="file" name="sales_data" accept=".csv,.xlsx" required /></Field>
            <a className="og-template-link" href="/api/sales-template" download>Download sales data template <ArrowRight size={15} aria-hidden="true" /></a>
            <div className="grid c2"><Field label="Outstanding debt · Rp"><input className="input" type="number" name="debtOutstanding" min={0} defaultValue={0} required /></Field><Field label="Monthly installment · Rp"><input className="input" type="number" name="debtInstallment" min={0} defaultValue={0} required /></Field><Field label="Lender · if applicable"><input className="input" name="debtLender" /></Field><label className="og-check-row"><input type="checkbox" name="covenantRestricts" /> Loan terms restrict revenue transfers</label></div>
          </Section>
        </div>

        <div className="og-wizard-step" data-wizard-step="3" hidden={step !== 3}>
          <Section title="Proposed offer">
            <Field label="Initial token price · Rp"><input className="input" name="tokenPrice" type="number" min={1000} max={100000000} step={1000} defaultValue={10000} required /></Field>
            <Field label={`Share of distributable net profit · ${stake / 100}%`}><input className="og-range" type="range" name="stakeBps" min={MIN_STAKE_BPS} max={MAX_STAKE_BPS} step={100} value={stake} onChange={(e) => setStake(Number(e.target.value))} /><span className="og-range-value">{stake / 100}%</span></Field>
            <Field label="How will the proceeds be used?"><textarea className="input" name="useOfFunds" required minLength={10} maxLength={400} rows={3} /></Field>
          </Section>
          <Section title="Owner payout account">
            <div className="grid c3"><Field label="Bank"><input className="input" name="bank" required /></Field><Field label="Account holder"><input className="input" name="accountName" required /></Field><Field label="Account number"><input className="input" name="accountNumber" required inputMode="numeric" /></Field></div>
          </Section>
        </div>

        <div className="og-wizard-step" data-wizard-step="4" hidden={step !== 4}>
          <Section title="Required & supporting documents">
            <p className="og-form-intro">PDF, PNG, or JPG · up to 10 MB per file. Required files are marked.</p>
            <div className="og-document-grid">{DOCS.map((doc) => <Field key={doc.kind} label={<>{doc.label}{doc.required && <span className="og-required">Required</span>}</>}><input className="input og-file-input" type="file" name={`doc_${doc.kind}`} accept=".pdf,.png,.jpg,.jpeg" required={doc.required} multiple={doc.kind === "photo"} /></Field>)}</div>
          </Section>
        </div>

        <div className="og-wizard-step" data-wizard-step="5" hidden={step !== 5}>
          <Section title="Review & consent">
            <div className="og-review-summary"><b>What happens next</b><p>An operator and an independent reviewer examine the submission. If approved, the owner signs the acquisition separately. No token is issued before that signature.</p></div>
            <label className="og-check-row"><input type="checkbox" name="gatewayOnly" required /> Venue digital payments will use the approved payment gateway.</label>
            <label className="og-check-row"><input type="checkbox" name="bankDataAccess" /> I allow bank statement access for revenue reconciliation.</label>
            <label className="og-check-row"><input type="checkbox" name="dataProcessing" required /> I agree to data processing, including AI review of redacted document text.</label>
            <label className="og-check-row"><input type="checkbox" name="truthful" required /> I confirm this information is accurate.</label>
            {withOwnerEmail && <p className="og-final-note">Submitting records Grounds’ proposed purchase approval. The owner still signs the rights transfer and simulated payment receipt with their own wallet.</p>}
          </Section>
        </div>

        <div className="og-wizard-controls">
          <span>Step {step + 1} of {STEPS.length}</span>
          <div>{step > 0 && <button className="btn" type="button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>}{step < STEPS.length - 1 ? <button className="btn primary" type="button" onClick={next}>Continue <ArrowRight size={16} aria-hidden="true" /></button> : <button className="btn primary" type="submit">Submit for review <ArrowRight size={16} aria-hidden="true" /></button>}</div>
        </div>
      </SpotlightPanel>
    </div>
  </form>;
}
