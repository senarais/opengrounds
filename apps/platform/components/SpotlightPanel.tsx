"use client";

import type { ReactNode } from "react";
import SpotlightCard from "@/components/ui/SpotlightCard";

export function SpotlightPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <SpotlightCard className={`og-interior-spotlight ${className}`} theme="light" spotlightColor="#c25a00" intensity={0.42} spotlightSize={340} softness={0.94} borderGlow={0.22} proximity={100} smoothing={0.48} flare={false} grain={0.08}>{children}</SpotlightCard>;
}
