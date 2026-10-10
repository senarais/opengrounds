"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { ShaderBackground } from "@/components/ui/shader-background";
import FluidFlowGrid from "@/components/ui/fluid-flow-grid";

export function HeroAtmosphere() {
  const [paused, setPaused] = useState(false);
  return <>
    <div className="og-hero-atmosphere" aria-hidden="true"><ShaderBackground className="og-hero-mesh" paused={paused} /><FluidFlowGrid className="og-hero-flow" paused={paused} /></div>
    <button type="button" className="og-atmosphere-control" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}{paused ? "Resume background" : "Pause background"}</button>
  </>;
}
