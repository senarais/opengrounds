"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Muat ulang data halaman tiap beberapa detik selama proses latar belakang (mis. analisis AI) masih berjalan. */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
