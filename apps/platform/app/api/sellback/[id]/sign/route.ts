import type { Hex } from "viem";
import { getMe } from "@/lib/auth";
import { jsonGuard } from "@/lib/flow";
import { signSellBack } from "@/lib/flows/sellback";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return jsonGuard(async () => {
    const me = await getMe();
    if (!me || me.role !== "investor") throw new Error("Sign in with an investor account.");
    const { signature } = (await req.json()) as { signature: Hex };
    return { message: await signSellBack(me, (await params).id, signature) };
  });
}
