"use client";

import { useEffect, useRef, type RefObject } from "react";

export interface CanvasRenderer {
  resize: (width: number, height: number, ratio: number) => void;
  render: (time: number, delta: number) => void | false;
  dispose: () => void;
}

/** Shared clock for the two hero layers: bounded resolution, 30fps, optional motion. */
export function useCanvasAnimation(ref: RefObject<HTMLCanvasElement | null>, paused: boolean, createRenderer: (canvas: HTMLCanvasElement) => CanvasRenderer | null) {
  const control = useRef({ paused, update: () => {} });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas);
    if (!renderer) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = true;
    let raf = 0;
    let elapsed = 0;
    let last: number | null = null;
    let disposed = false;
    const active = () => !control.current.paused && !motion.matches;

    function requestRender() {
      if (!disposed && inView && document.visibilityState === "visible" && !raf) raf = requestAnimationFrame(render);
    }
    const render = (now: number) => {
      raf = 0;
      if (disposed || !inView || document.visibilityState !== "visible") return;
      if (last !== null && now - last < 1000 / 30) { requestRender(); return; }
      const delta = last === null ? 0 : Math.min((now - last) / 1000, .1);
      if (active()) elapsed += delta;
      last = now;
      if (renderer.render(elapsed, delta) === false) { delete canvas.dataset.ready; last = null; return; }
      if (canvas.dataset.ready !== "true") canvas.dataset.ready = "true";
      if (active()) requestRender();
      else last = null;
    };
    const update = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = null;
      requestRender();
    };
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const ratio = Math.min(dpr, Math.sqrt(1_200_000 / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      renderer.resize(width, height, ratio);
      update();
    };
    control.current.update = update;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { inView = !!entry?.isIntersecting; update(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      window.removeEventListener("resize", resize);
      control.current.update = () => {};
      renderer.dispose();
      delete canvas.dataset.ready;
    };
  }, [ref, createRenderer]);

  useEffect(() => { control.current.paused = paused; control.current.update(); }, [paused]);
}
