import { PageHeader } from "@venue-rwa/ui";
import { ApplyForm } from "@/components/ApplyForm";
import { requireArea } from "@/lib/auth";
import { submitForOwner } from "./actions";

export const metadata = { title: "New venue application · Grounds" };

export default async function SpvApply({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireArea("spv");
  const sp = await searchParams;
  return (
    <div className="container">
      <PageHeader eyebrow="Grounds · SPV" title="New venue application" lead="Submit the venue and offer details for review." />
      <div className="mt"><ApplyForm action={submitForOwner} error={sp.err} withOwnerEmail /></div>
    </div>
  );
}
