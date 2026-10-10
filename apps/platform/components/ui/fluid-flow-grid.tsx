"use client";

import { useRef } from "react";
import { useCanvasAnimation, type CanvasRenderer } from "@/lib/use-canvas-animation";

// Transparent, section-sized adaptation of the directional flow field in the brief.
function createFlow(canvas: HTMLCanvasElement): CanvasRenderer | null {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  let width = 0;
  let height = 0;
  const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const bounds = canvas.getBoundingClientRect();
    mouse.targetX = event.clientX - bounds.left;
    mouse.targetY = event.clientY - bounds.top;
    if (mouse.targetX < 0 || mouse.targetX > width || mouse.targetY < 0 || mouse.targetY > height) leave();
  };
  const leave = () => { mouse.targetX = mouse.targetY = -1000; };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("blur", leave);
  window.addEventListener("scroll", leave, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  return {
    resize: (w, h, ratio) => { width = w; height = h; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); },
    render: (time, delta) => {
      ctx.clearRect(0, 0, width, height);
      const follow = 1 - Math.exp(-5 * delta);
      mouse.x += (mouse.targetX - mouse.x) * follow;
      mouse.y += (mouse.targetY - mouse.y) * follow;
      const t = time * .34;
      const spacing = width < 600 ? 42 : 38;
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += spacing) {
        for (let y = 0; y <= height; y += spacing) {
          let angle = Math.sin(x * .003 + t) + Math.cos(y * .003 + t);
          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const distance = Math.hypot(dx, dy);
          const near = distance < 180 && distance > 0;
          if (near) { const force = 1 - distance / 180; angle = angle * (1 - force) + (Math.atan2(dy, dx) + Math.PI) * force; }
          const length = near ? 19 : 12;
          ctx.strokeStyle = near ? "rgba(168, 65, 0, .36)" : `rgba(23, 23, 23, ${.11 + Math.sin(x * .01 + y * .01 + t) * .05})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
          ctx.stroke();
        }
      }
    },
    dispose: () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", leave);
      document.documentElement.removeEventListener("pointerleave", leave);
    },
  };
}

export default function FluidFlowGrid({ className, paused = false }: { className?: string; paused?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasAnimation(ref, paused, createFlow);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
