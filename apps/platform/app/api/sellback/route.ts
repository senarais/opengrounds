import { getMe } from "@/lib/auth";
import { jsonGuard } from "@/lib/flow";
import { requestSellBack } from "@/lib/flows/sellback";

export async function POST(req: Request) {
  return jsonGuard(async () => {
    const me = await getMe();
    if (!me || me.role !== "investor") throw new Error("Sign in with an investor account.");
    const b = (await req.json()) as { seriesId: string; tokens: number };
    const { request, typed } = await requestSellBack(me, b.seriesId, Number(b.tokens));
    return { requestId: request.id, typed, amount: Number(request.amount_idr) };
  });
}
