"use client";

import { useState } from "react";
import { getImageProps } from "next/image";
import { Pause, Play } from "lucide-react";
import { TiltedGridHero } from "@/components/ui/tilted-grid-hero";

const images = [
  { src: "/landing-padel.jpg", alt: "An indoor padel court" },
  { src: "/landing-player.jpg", alt: "A player serving on a clay tennis court" },
  { src: "/landing-football.jpg", alt: "An outdoor football pitch" },
  { src: "/landing-basketball.jpg", alt: "A basketball hoop" },
  { src: "/landing-tennis.jpg", alt: "A player on a blue tennis court" },
].map((image) => ({ ...image, src: getImageProps({ ...image, width: 500, height: 350 }).props.src }));

export function VenueReel() {
  const [paused, setPaused] = useState(false);
  return <div className="og-reel-wrapper"><TiltedGridHero images={images} className="og-reel" speed={7} tileHeight={68} aspectRatio={1.4} curve={55} gap={7} axis={50} fade={7} paused={paused} /><button className="og-reel-control" type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}{paused ? "Resume gallery" : "Pause gallery"}</button></div>;
}
