import { SALES_TEMPLATE_MONTHLY } from "@venue-rwa/shared";

export function GET() {
  return new Response(SALES_TEMPLATE_MONTHLY, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="template-keuangan.csv"' } });
}
