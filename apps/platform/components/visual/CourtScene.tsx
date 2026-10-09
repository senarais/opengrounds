"use client";
import { Bounds, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface CourtFacility { name: string; sport: string; lengthM: number; widthM: number; surface: string; indoor: boolean; pricePerHour: number }

const SURFACE: Record<string, string> = {
  "rumput sintetis": "#5fa77a", vinyl: "#3f6fb5", "parket kayu": "#d39a5c", "semen/beton": "#a7b1c2", karpet: "#4f86c6", "tanah liat": "#d2774a", lainnya: "#5b8fc9",
};
/** Kapasitas pemain per lapangan (untuk menerjemahkan okupansi menjadi jumlah orang kecil). */
const CAPACITY: Record<string, number> = { futsal: 10, "mini soccer": 14, basket: 10, badminton: 4, tenis: 4, voli: 12, padel: 4, lainnya: 6 };
const SHIRTS = ["#ff7a00", "#ffd166", "#334155", "#f8fafc", "#38bdf8", "#94a3b8"];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 = malam, 1 = siang penuh. */
export function daylight(h: number) {
  if (h < 5.5 || h >= 19) return 0;
  if (h < 7) return (h - 5.5) / 1.5;
  if (h <= 17) return 1;
  return 1 - (h - 17) / 2;
}
function skyColor(h: number) {
  const day = new THREE.Color("#e8eef6"), dusk = new THREE.Color("#ffd6aa"), night = new THREE.Color("#0f172a");
  const d = daylight(h);
  if (h >= 16 && h < 19) return h < 17.5 ? day.clone().lerp(dusk, (h - 16) / 1.5) : dusk.clone().lerp(night, (h - 17.5) / 1.5);
  return night.clone().lerp(day, d);
}
/** Angka semu-acak yang stabil (posisi orang tidak melompat tiap render). */
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function Person({ x, z, color, i }: { x: number; z: number; color: string; i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = 0.16 + Math.abs(Math.sin(t * 3 + i)) * 0.08;
    ref.current.position.x = x + Math.sin(t * 0.7 + i * 2) * 0.25;
  });
  return (
    <group ref={ref} position={[x, 0.16, z]}>
      <mesh castShadow position={[0, 0.22, 0]}><cylinderGeometry args={[0.13, 0.16, 0.42, 10]} /><meshStandardMaterial color={color} /></mesh>
      <mesh castShadow position={[0, 0.56, 0]}><sphereGeometry args={[0.15, 14, 14]} /><meshStandardMaterial color="#e8c4a6" /></mesh>
    </group>
  );
}

function Line({ p, s }: { p: [number, number, number]; s: [number, number, number] }) {
  return <mesh position={p}><boxGeometry args={s} /><meshStandardMaterial color="#ffffff" /></mesh>;
}

function Fixtures({ sport, L, W }: { sport: string; L: number; W: number }) {
  const white = "#fafafa";
  if (sport === "futsal" || sport === "mini soccer") {
    const gw = W * 0.3;
    return (
      <>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (L / 2 - 0.05), 0, 0]}>
            <mesh position={[0, 0.45, gw / 2]}><boxGeometry args={[0.08, 0.9, 0.08]} /><meshStandardMaterial color={white} /></mesh>
            <mesh position={[0, 0.45, -gw / 2]}><boxGeometry args={[0.08, 0.9, 0.08]} /><meshStandardMaterial color={white} /></mesh>
            <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.08, 0.08, gw]} /><meshStandardMaterial color={white} /></mesh>
            <mesh position={[side * 0.25, 0.45, 0]}><boxGeometry args={[0.5, 0.86, gw]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.18} /></mesh>
          </group>
        ))}
      </>
    );
  }
  if (sport === "basket") {
    return (
      <>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (L / 2 - 0.3), 0, 0]}>
            <mesh position={[side * 0.25, 1, 0]}><cylinderGeometry args={[0.06, 0.06, 2, 8]} /><meshStandardMaterial color="#475569" /></mesh>
            <mesh position={[0, 1.75, 0]}><boxGeometry args={[0.06, 0.6, 0.9]} /><meshStandardMaterial color={white} /></mesh>
            <mesh position={[-side * 0.22, 1.55, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.18, 0.03, 8, 20]} /><meshStandardMaterial color="#ff7a00" /></mesh>
          </group>
        ))}
      </>
    );
  }
  if (["badminton", "tenis", "voli", "padel"].includes(sport)) {
    const h = sport === "voli" ? 1.1 : sport === "badminton" ? 0.85 : 0.5;
    return (
      <>
        <mesh position={[0, h / 2 + 0.06, 0]}><boxGeometry args={[0.04, h, W]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.55} /></mesh>
        <mesh position={[0, h + 0.06, 0]}><boxGeometry args={[0.06, 0.05, W]} /><meshStandardMaterial color={white} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[0, (h + 0.1) / 2, s * (W / 2 + 0.1)]}><cylinderGeometry args={[0.05, 0.05, h + 0.1, 8]} /><meshStandardMaterial color="#475569" /></mesh>)}
        {sport === "padel" && (
          <>
            {[-1, 1].map((s) => <mesh key={`x${s}`} position={[s * L / 2, 0.45, 0]}><boxGeometry args={[0.05, 0.9, W]} /><meshStandardMaterial color="#cfe6ff" transparent opacity={0.3} /></mesh>)}
            {[-1, 1].map((s) => <mesh key={`z${s}`} position={[0, 0.45, s * W / 2]}><boxGeometry args={[L, 0.9, 0.05]} /><meshStandardMaterial color="#cfe6ff" transparent opacity={0.22} /></mesh>)}
          </>
        )}
      </>
    );
  }
  return null;
}

function LightPole({ x, z, night }: { x: number; z: number; night: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.06, 0.08, 2.8, 8]} /><meshStandardMaterial color="#475569" /></mesh>
      <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.2, 14, 14]} /><meshStandardMaterial color={night ? "#fff1c4" : "#e2e8f0"} emissive={night ? "#ffd166" : "#000000"} emissiveIntensity={night ? 2.2 : 0} /></mesh>
      {night && <pointLight position={[0, 2.6, 0]} intensity={6} distance={9} color="#ffe3a3" />}
    </group>
  );
}

function Court({ f, pos, L, W, occ, night, picked, onPick, index }: { f: CourtFacility; pos: [number, number]; L: number; W: number; occ: number; night: boolean; picked: boolean; onPick: (i: number) => void; index: number }) {
  const cap = CAPACITY[f.sport] ?? 6;
  const n = Math.round(Math.max(0, Math.min(1, occ)) * cap);
  const people = useMemo(() => Array.from({ length: n }, (_, k) => ({ x: (rnd(index * 50 + k) - 0.5) * (L - 0.8), z: (rnd(index * 50 + k + 17) - 0.5) * (W - 0.8), c: SHIRTS[(index + k) % SHIRTS.length]! })), [n, L, W, index]);
  const lw = 0.05;
  return (
    <group position={[pos[0], 0.31, pos[1]]} onPointerDown={(e) => { e.stopPropagation(); onPick(index); }}>
      <mesh receiveShadow position={[0, -0.02, 0]}><boxGeometry args={[L + 0.6, 0.08, W + 0.6]} /><meshStandardMaterial color={picked ? "#ffd166" : "#e2e8f0"} /></mesh>
      <mesh receiveShadow position={[0, 0.04, 0]}><boxGeometry args={[L, 0.08, W]} /><meshStandardMaterial color={SURFACE[f.surface] ?? SURFACE.lainnya} /></mesh>
      <group position={[0, 0.09, 0]}>
        <Line p={[0, 0, W / 2 - lw / 2]} s={[L, 0.01, lw]} /><Line p={[0, 0, -W / 2 + lw / 2]} s={[L, 0.01, lw]} />
        <Line p={[L / 2 - lw / 2, 0, 0]} s={[lw, 0.01, W]} /><Line p={[-L / 2 + lw / 2, 0, 0]} s={[lw, 0.01, W]} />
        <Line p={[0, 0, 0]} s={[lw, 0.01, W]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}><ringGeometry args={[Math.min(L, W) * 0.13, Math.min(L, W) * 0.13 + lw, 32]} /><meshStandardMaterial color="#ffffff" /></mesh>
      </group>
      <group position={[0, 0.08, 0]}><Fixtures sport={f.sport} L={L} W={W} /></group>
      {people.map((p, k) => <Person key={k} x={p.x} z={p.z} color={p.c} i={k + index * 10} />)}
      <LightPole x={L / 2 + 0.35} z={W / 2 + 0.35} night={night} />
      <LightPole x={-L / 2 - 0.35} z={-W / 2 - 0.35} night={night} />
      <Html position={[0, 1.6, -W / 2 - 0.2]} center distanceFactor={undefined} style={{ pointerEvents: "none" }}>
        <div style={{ background: "rgba(255,255,255,.92)", border: "1px solid #cbd5e1", borderRadius: 999, padding: "2px 10px", font: "600 11px/1.5 var(--font-sans, sans-serif)", color: "#0f172a", boxShadow: "0 2px 6px rgba(15,23,42,.12)", whiteSpace: "nowrap" }}>
          {f.name}{f.indoor ? " · indoor" : ""}
        </div>
      </Html>
    </group>
  );
}

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0.3, z]} scale={s}>
      <mesh castShadow position={[0, 0.3, 0]}><cylinderGeometry args={[0.08, 0.1, 0.6, 8]} /><meshStandardMaterial color="#8b6a4f" /></mesh>
      <mesh castShadow position={[0, 0.9, 0]}><coneGeometry args={[0.45, 1, 10]} /><meshStandardMaterial color="#4f9a6e" /></mesh>
    </group>
  );
}

/** Tribun; penonton/antrean ikut okupansi (ilustrasi keramaian, bukan data jumlah orang). */
function Stands({ x, z, len, fans, onPick }: { x: number; z: number; len: number; fans: number; onPick: () => void }) {
  const seats = useMemo(() => Array.from({ length: fans }, (_, k) => ({ row: k % 3, x: (rnd(k + 900) - 0.5) * (len - 0.5), c: SHIRTS[k % SHIRTS.length]! })), [fans, len]);
  return (
    <group position={[x, 0.31, z]} onPointerDown={(e) => { e.stopPropagation(); onPick(); }}>
      {[0, 1, 2].map((k) => (
        <mesh key={k} castShadow position={[0, 0.12 + k * 0.18, k * 0.35]}><boxGeometry args={[len, 0.24 + k * 0.36, 0.38]} /><meshStandardMaterial color={["#e2e8f0", "#cbd5e1", "#94a3b8"][k]} /></mesh>
      ))}
      {seats.map((s, k) => (
        <group key={k} position={[s.x, 0.24 + s.row * 0.36, s.row * 0.35]}>
          <mesh castShadow position={[0, 0.16, 0]}><cylinderGeometry args={[0.1, 0.12, 0.3, 8]} /><meshStandardMaterial color={s.c} /></mesh>
          <mesh castShadow position={[0, 0.4, 0]}><sphereGeometry args={[0.11, 12, 12]} /><meshStandardMaterial color="#e8c4a6" /></mesh>
        </group>
      ))}
    </group>
  );
}

export interface SceneProps { facilities: CourtFacility[]; hour: number; occupancy: number; picked: number | null; onPick: (i: number | null) => void }

export default function CourtScene({ facilities, hour, occupancy, picked, onPick }: SceneProps) {
  const list = facilities.slice(0, 4);
  const maxL = Math.max(...list.map((f) => f.lengthM), 1);
  const k = 9 / maxL; // lapangan terpanjang = 9 unit; ukuran lain proporsional terhadap meter sebenarnya
  const sizes = list.map((f) => ({ L: f.lengthM * k, W: f.widthM * k }));
  const cols = list.length <= 2 ? 1 : 2;
  const gap = 1.6;
  const colW = Math.max(...sizes.map((s) => s.L)) + gap;
  const rowsH: number[] = [];
  sizes.forEach((s, i) => { const r = Math.floor(i / cols); rowsH[r] = Math.max(rowsH[r] ?? 0, s.W + gap); });
  const totalW = cols * colW, totalD = rowsH.reduce((a, b) => a + b, 0);
  const positions: [number, number][] = sizes.map((_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const z = rowsH.slice(0, r).reduce((a, b) => a + b, 0) + rowsH[r]! / 2 - totalD / 2;
    return [c * colW + colW / 2 - totalW / 2, z];
  });
  const d = daylight(hour);
  const night = hour >= 18 || hour < 6;
  const bg = skyColor(hour);
  const plateW = totalW + 3, plateD = totalD + 3.4;
  return (
    <Canvas orthographic shadows dpr={[1, 2]} camera={{ position: [14, 13, 14], zoom: 30, near: -100, far: 200 }} onPointerMissed={() => onPick(null)}>
      <color attach="background" args={[bg.getStyle()]} />
      <ambientLight intensity={lerp(0.4, 0.95, d)} color={night ? "#9fb3d9" : "#ffffff"} />
      <directionalLight castShadow position={[8, 14, 6]} intensity={lerp(0.05, 1.6, d)} shadow-mapSize={[1024, 1024]} />
      <hemisphereLight args={["#ffffff", "#e2e8f0", lerp(0.15, 0.5, d)]} />
      <Bounds fit clip observe margin={1.02}>
        <group>
          <RoundedBox args={[plateW, 0.6, plateD]} radius={0.25} smoothness={3} position={[0, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#cbd5e1" />
          </RoundedBox>
          <mesh receiveShadow position={[0, 0.305, 0]}><boxGeometry args={[plateW - 0.3, 0.02, plateD - 0.3]} /><meshStandardMaterial color="#dbe7dc" /></mesh>
          {list.map((f, i) => (
            <Court key={i} index={i} f={f} pos={positions[i]!} L={sizes[i]!.L} W={sizes[i]!.W} occ={occupancy} night={night} picked={picked === i} onPick={(x) => onPick(x)} />
          ))}
          <Stands x={0} z={plateD / 2 - 1.3} len={Math.min(totalW, 8)} fans={Math.round(Math.max(0, Math.min(1, occupancy)) * 10)} onPick={() => onPick(-1)} />
          <Tree x={-plateW / 2 + 0.6} z={-plateD / 2 + 0.6} />
          <Tree x={plateW / 2 - 0.6} z={-plateD / 2 + 0.7} s={0.8} />
          <Tree x={-plateW / 2 + 0.7} z={plateD / 2 - 0.6} s={0.9} />
        </group>
      </Bounds>
      <OrbitControls makeDefault enablePan={false} minPolarAngle={0.35} maxPolarAngle={1.2} minZoom={12} maxZoom={90} />
    </Canvas>
  );
}
