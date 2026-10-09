import { getMe } from "@/lib/auth";
import { jsonGuard } from "@/lib/flow";
import { createOrder } from "@/lib/flows/orders";

/** Buat pesanan dan kembalikan data EIP-712 untuk ditandatangani investor di wallet Privy. */
export async function POST(req: Request) {
  return jsonGuard(async () => {
    const me = await getMe();
    if (!me || me.role !== "investor") throw new Error("Khusus investor yang sudah login");
    const b = (await req.json()) as { seriesId: string; tokens: number; funding?: "payment" | "balance" };
    const { order, typed } = await createOrder(me, b.seriesId, Number(b.tokens), b.funding === "balance" ? "balance" : "payment");
    return { orderId: order.id, typed, amount: Number(order.amount_idr) };
  });
}
