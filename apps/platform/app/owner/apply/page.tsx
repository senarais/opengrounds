import { PageHeader } from "@venue-rwa/ui";
import { ApplyForm } from "@/components/ApplyForm";
import { requireOwner } from "@/lib/auth";
import { submitVenue } from "./actions";

export const metadata = { title: "Submit a venue · Open Grounds" };
export default async function OwnerApply({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireOwner("/owner/apply");
  const sp = await searchParams;
  return <div className="container"><PageHeader eyebrow="Owner portal" title="Submit your venue" lead="Upload your venue, business documents, financial history, and proposed profit-rights offer for review." /><div className="mt"><ApplyForm action={submitVenue} error={sp.err} /></div></div>;
}
