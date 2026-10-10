"use client";

import { useRef } from "react";
import { useCanvasAnimation, type CanvasRenderer } from "@/lib/use-canvas-animation";

// Mesh drift + film grain adapted from the supplied 21st.dev Shader Builder recipe.
// Only the active recipe remains: four orange/white fields, no unused cursor/OKLab modes.
const VERT = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#define SEED 1453.0
#else
precision mediump float;
#define SEED 27.0
#endif
uniform vec4 u_scene;
uniform vec3 u_colors[4];

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_scene.xy) / min(u_scene.x, u_scene.y);
  p *= 1.16;
  float t = u_scene.z * 0.46;
  vec3 acc = u_colors[0] * 0.15;
  float total = 0.15;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(
      sin(t * (0.21 + fi * 0.071) + fi * 2.4 + SEED),
      cos(t * (0.17 + fi * 0.093) + fi * 1.7)) * 0.569;
    float w = exp(-dot(p - c, p - c) * 6.0);
    acc += u_colors[i] * w;
    total += w;
  }
  vec3 col = acc / total;
  col += (grainHash(gl_FragCoord.xy + vec2(SEED * 17.0, SEED * 31.0)) - 0.5) * 0.055;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const releases = new WeakMap<HTMLCanvasElement, number>();

function createMesh(canvas: HTMLCanvasElement): CanvasRenderer | null {
  const pending = releases.get(canvas);
  if (pending !== undefined) window.clearTimeout(pending);
  releases.delete(canvas);
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERT);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  const buffer = gl.createBuffer();
  if (!buffer) { gl.deleteProgram(program); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const scene = gl.getUniformLocation(program, "u_scene");
  gl.uniform3fv(gl.getUniformLocation(program, "u_colors[0]"), new Float32Array([
    1, .478, 0,       // Sunrise orange
    1, .72, .46,     // orange softened with white
    1, .94, .87,     // warm white
    .99, .98, .96,   // paper white
  ]));
  return {
    resize: () => gl.viewport(0, 0, canvas.width, canvas.height),
    render: (time) => { if (gl.isContextLost()) return false; gl.uniform4f(scene, canvas.width, canvas.height, time, 4); gl.drawArrays(gl.TRIANGLES, 0, 3); },
    dispose: () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      // Strict Mode immediately remounts; defer context release until that opportunity passes.
      const timer = window.setTimeout(() => {
        if (releases.get(canvas) !== timer) return;
        releases.delete(canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.width = canvas.height = 1;
      }, 0);
      releases.set(canvas, timer);
    },
  };
}

export function ShaderBackground({ className, paused = false }: { className?: string; paused?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasAnimation(ref, paused, createMesh);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
