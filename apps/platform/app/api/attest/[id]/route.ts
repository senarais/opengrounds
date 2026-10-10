import type { Hex } from "viem";
import { getMe, type Me } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { getSeries, jsonGuard, needContract } from "@/lib/flow";
import { verifierSignValuation } from "@/lib/flows/admin";
import { walletJsonOf } from "@/lib/flows/attest";
import { ownerOfVenue } from "@/lib/flows/onboarding";
import { signPeriod } from "@/lib/flows/periods";
import { ownerSignAcquisition } from "@/lib/flows/series";

/** Allow only the series owner or an independent reviewer to open/sign an attestation. */
async function load(id: string, me: Me | null) {
  if (!me) throw new Error("Sign in to continue.");
  const { data: att } = await platformDb().from("attestations").select("*").eq("id", id).maybeSingle();
  if (!att) throw new Error("Attestation not found.");
  const ctx = await getSeries(att.series_id);
  const isOwner = me.role === "owner" && (await ownerOfVenue(ctx.venue.id)) === me.userId;
  const isReviewer = me.role === "reviewer";
  if (!isOwner && !isReviewer) throw new Error("Your account is not a signer for this attestation.");
  if (isOwner && att.kind === "VALUATION_UPDATE") throw new Error("Revaluations are signed by the platform and verifier, not the owner.");
  if (isReviewer && att.kind === "ACQUISITION_CLOSED") throw new Error("Acquisitions are signed by the platform and owner.");
  return { att, ctx, isOwner };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return jsonGuard(async () => {
    const { att, ctx } = await load((await params).id, await getMe());
    return { typed: walletJsonOf(att, needContract(ctx)), kind: att.kind, payload: att.payload };
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return jsonGuard(async () => {
    const { att } = await load((await params).id, await getMe());
    const { signature } = (await req.json()) as { signature: Hex };
    if (att.kind === "ACQUISITION_CLOSED") return { message: await ownerSignAcquisition(att.series_id, att.id, signature) };
    if (att.kind === "REVENUE_PERIOD") return { message: await signPeriod(att.series_id, Number(att.ref_id), signature) };
    return { message: await verifierSignValuation(att.id, signature) };
  });
}
