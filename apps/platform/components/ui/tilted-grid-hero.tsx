"use client";

import * as React from "react";
import "./tilted-grid-hero.css";

// Adapted from the curved, sliced-image grid supplied in the design brief.
const SLICES = 16;
const CAMERA = 1.6;
const MAX_WIDTH = 55;
const arc = (bend: number) => (CAMERA - 1 + Math.cos(bend)) / (2 * CAMERA * Math.sin(bend));

export function measureGrid(width: number, height: number, tile: number, aspect: number, gap: number, bend: number) {
  const h = Math.min((tile / 100) * height, ((MAX_WIDTH / 100) * width) / aspect);
  const radius = width * arc(bend);
  if (!(h > 0) || !(radius > 0)) return { columns: 2, sweep: 0, unit: 0, limit: 0 };
  const deg = (rad: number) => rad * 180 / Math.PI;
  const unit = deg(h / radius);
  const pitch = (aspect + gap / 100) * unit;
  const limit = deg(bend) + aspect * unit / 2;
  const columns = Math.min(60, Math.max(2, Math.ceil(2 * limit / pitch)));
  const round = (n: number) => +n.toFixed(4);
  const sweep = round(columns * pitch / 2);
  return { columns, sweep, unit: round(unit), limit: round(Math.min(sweep, limit)) };
}

export type TiltedGridImage = { src: string; alt?: string };
export type TiltedGridHeroProps = {
  images: TiltedGridImage[];
  speed?: number;
  tileHeight?: number;
  aspectRatio?: number;
  gap?: number;
  axis?: number;
  curve?: number;
  fade?: number;
  paused?: boolean;
};

export function TiltedGridHero({ images, speed = 4, tileHeight = 26, aspectRatio = 16 / 9, gap = 6, axis = 56, curve = 80, fade = 12, paused = false, className = "", children, style, ...props }: React.ComponentProps<"div"> & TiltedGridHeroProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const orbit = `tgh-o-${id}`;
  const bend = Math.min(85, Math.max(5, curve)) * Math.PI / 180;
  const [layout, setLayout] = React.useState<ReturnType<typeof measureGrid> | null>(null);
  const [shown, setShown] = React.useState<Record<number, number>>({});
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const next = measureGrid(width, height, tileHeight, aspectRatio, gap, bend);
      setLayout((prev) => prev?.columns === next.columns && prev.sweep === next.sweep && prev.unit === next.unit && prev.limit === next.limit ? prev : next);
    });
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), { rootMargin: "150px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, [tileHeight, aspectRatio, gap, bend]);

  React.useEffect(() => {
    if (!inView) return;
    for (const { src } of images) new window.Image().src = src;
  }, [images, inView]);

  const { columns, sweep, unit, limit } = layout ?? measureGrid(1200, 400, tileHeight, aspectRatio, gap, bend);
  const u = (n: number) => `calc(${+n.toFixed(4)} * min(${tileHeight}cqh, ${+(MAX_WIDTH / aspectRatio).toFixed(4)}cqw))`;
  const r = 100 * arc(bend);
  const radius = `${+r.toFixed(3)}cqw`;
  const turn = (deg: number) => `translateZ(${radius}) rotateY(${+deg.toFixed(4)}deg) translateZ(-${radius})`;
  const hide = +((sweep - limit) / (2 * sweep || 1) * 100).toFixed(4);
  const css = `@keyframes ${orbit}{from{transform:${turn(-sweep)}}to{transform:${turn(sweep)}}0%,${hide}%,${100 - hide}%,100%{visibility:hidden}${hide + 0.001}%,${100 - hide - 0.001}%{visibility:visible}}`;
  const share = aspectRatio / SLICES;
  const duration = columns * speed;
  const mask = `linear-gradient(90deg,transparent,#000 ${fade}%,#000 ${100 - fade}%,transparent)`;

  return <div ref={ref} className={`tgh ${className}`} {...props} style={style}>
    <style>{css}</style>
    <div aria-hidden="true" className="tgh-band" style={{ opacity: layout ? 1 : 0, perspective: `${+(r * CAMERA).toFixed(3)}cqw`, perspectiveOrigin: `50% ${axis}%`, maskImage: mask, WebkitMaskImage: mask }}>
      {images.length > 0 && Array.from({ length: columns }, (_, t) => {
        const first = columns - 1 - t;
        const img = images[(shown[t] ?? first) % images.length];
        return <div key={t} className="tgh-tile" style={{ left: `calc(50% - ${u(aspectRatio / 2)})`, top: `calc(${axis}% - ${u(0.5)})`, width: u(aspectRatio), height: u(1), animationName: orbit, animationDuration: `${duration}s`, animationDelay: `${-t * speed}s`, animationPlayState: paused || !inView ? "paused" : "running" }} onAnimationIteration={(e) => {
          if (e.target !== e.currentTarget) return;
          const lap = Math.round(e.elapsedTime / duration);
          setShown((prev) => { const next = lap * columns + first; return prev[t] === next ? prev : { ...prev, [t]: next }; });
        }}>
          {Array.from({ length: SLICES }, (_, k) => <div key={k} className="tgh-slice" style={{ left: u((aspectRatio - share) / 2), width: k === SLICES - 1 ? u(share) : `calc(${u(share)} + 1px)`, height: u(1), transform: turn((aspectRatio / 2 - (k + 0.5) * share) * unit) }}>
            {/* Facets intentionally use one browser-cached source, not sixteen Next image requests. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img && <img src={img.src} alt="" draggable={false} decoding="async" loading="lazy" style={{ left: u(-k * share), width: u(aspectRatio), height: u(1) }} />}
          </div>)}
        </div>;
      })}
    </div>
    {children}
  </div>;
}

export default TiltedGridHero;
