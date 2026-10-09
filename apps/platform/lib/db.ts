import { serviceClient } from "@venue-rwa/shared";

/** SERVER ONLY. Semua akses data sensitif lewat service_role di server. */
export const posDb = () => serviceClient("pos");
export const platformDb = () => serviceClient("platform");

export const DEMO_COMPANY_ID = "00000000-0000-4000-8000-0000000000a1"; // company demo "Ayo" (UUID tetap)
