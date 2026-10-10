import { getMe } from "@/lib/auth";
import { jsonGuard } from "@/lib/flow";
import { createOrder } from "@/lib/flows/orders";

/** Create an order and return EIP-712 data for the investor's Privy signature. */
export async function POST(req: Request) {
  return jsonGuard(async () => {
    const me = await getMe();
    if (!me || me.role !== "investor") throw new Error("Sign in with an investor account.");
    const b = (await req.json()) as { seriesId: string; tokens: number; funding?: "payment" | "balance" };
    const { order, typed } = await createOrder(me, b.seriesId, Number(b.tokens), b.funding === "balance" ? "balance" : "payment");
    return { orderId: order.id, typed, amount: Number(order.amount_idr) };
  });
}
