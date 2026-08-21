"use client";

import { useMemo, useRef, useState } from "react";
import { BedDouble, Cross, Layers3, LocateFixed, Maximize2, Minus, Plus, Search, Users } from "lucide-react";
import type { QueueRow } from "@/lib/api";

type Lens = "trajectory" | "occupancy" | "movement";
type Room = { x: number; y: number; w: number; h: number; label: string };
const ROOMS: Room[] = [
  { x: 122, y: 94, w: 176, h: 128, label: "01" }, { x: 310, y: 94, w: 158, h: 128, label: "02" },
  { x: 480, y: 94, w: 158, h: 128, label: "03" }, { x: 650, y: 94, w: 228, h: 128, label: "04" },
  { x: 122, y: 398, w: 176, h: 136, label: "05" }, { x: 310, y: 398, w: 158, h: 136, label: "06" },
  { x: 480, y: 398, w: 158, h: 136, label: "07" }, { x: 650, y: 398, w: 228, h: 136, label: "08" },
  { x: 28, y: 250, w: 182, h: 114, label: "09" }, { x: 792, y: 250, w: 188, h: 114, label: "10" },
  { x: 650, y: 250, w: 130, h: 114, label: "11" },
];

export function WardFloorPlan({ rows, selected, onSelect }: { rows: readonly QueueRow[]; selected: string | null; onSelect: (patientId: string) => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<Lens>("trajectory");
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [level, setLevel] = useState(2);
  const match = useMemo(() => rows.find((row) => row.name.toLowerCase().includes(query.toLowerCase()) || row.room?.toLowerCase().includes(query.toLowerCase())), [query, rows]);
  const selectedRow = rows.find((row) => row.patientId === (hovered ?? selected));
  const active = rows.filter((row) => row.level === "HIGH" || row.level === "CRITICAL").length;
  function locate() { if (match) { onSelect(match.patientId); setZoom(1.08); } }

  return <div ref={surface} className="floor-surface group relative h-[clamp(590px,69vh,820px)] overflow-hidden bg-[#e9eeec] fullscreen:h-screen">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_46%,rgba(255,255,255,.9),transparent_52%)]" />
    <div className="absolute left-5 top-5 z-20 flex h-11 w-[min(350px,calc(100%-150px))] items-center rounded-xl border border-white/80 bg-white/90 px-3 shadow-[0_12px_40px_rgba(26,52,43,.12)] backdrop-blur-xl">
      <Search size={15} className="text-faint" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && locate()} placeholder="Find a patient or room" className="min-w-0 flex-1 bg-transparent px-3 text-[12px] outline-none placeholder:text-faint" /><button onClick={locate} disabled={!match || !query} className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)] disabled:opacity-30">Locate</button>
    </div>
    <div className="absolute right-5 top-5 z-20 hidden rounded-xl border border-white/80 bg-white/90 p-1 shadow-[0_12px_40px_rgba(26,52,43,.1)] backdrop-blur-xl sm:flex">
      {(["trajectory", "occupancy", "movement"] as Lens[]).map((item) => <button key={item} onClick={() => setLens(item)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold capitalize transition ${lens === item ? "bg-[#173b35] text-white shadow-sm" : "text-dim hover:bg-sunk"}`}>{item}</button>)}
    </div>
    <div className="absolute left-5 top-20 z-20 overflow-hidden rounded-xl border border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(26,52,43,.1)] backdrop-blur-xl">
      {[3, 2, 1].map((floor) => <button key={floor} onClick={() => setLevel(floor)} className={`flex h-10 w-11 items-center justify-center border-b border-line text-[10px] font-semibold last:border-0 ${level === floor ? "bg-[#173b35] text-white" : "text-dim hover:bg-sunk"}`}>L{floor}</button>)}
    </div>
    <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out" style={{ transform: `translateY(18px) scale(${zoom})` }}>
      <svg viewBox="0 0 1020 650" className="h-full w-full select-none" role="group" aria-label={`Interactive North Ward, level ${level}`}>
        <defs><filter id="wardShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="26" stdDeviation="22" floodColor="#173b35" floodOpacity=".2" /></filter><linearGradient id="corridor" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#fbfdfc" /><stop offset="1" stopColor="#e2e9e6" /></linearGradient><linearGradient id="station" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#d9e9e4" /><stop offset="1" stopColor="#c3d8d1" /></linearGradient><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#cfd9d5" strokeWidth=".7" /></pattern></defs>
        <rect width="1020" height="650" fill="url(#grid)" opacity=".32" />
        <g filter="url(#wardShadow)" transform="skewX(-4)"><path d="M88 75h834v492H88z" fill="#acbbb5" opacity=".65" /><path d="M102 57h806v490H102z" fill="url(#corridor)" stroke="#aebdb7" strokeWidth="2" /><path d="M216 225h574v164H216z" fill="#edf2f0" stroke="#c2cec9" strokeWidth="2" /><path d="M246 258h378v98H246z" fill="url(#station)" stroke="#89a59b" strokeWidth="2" />
          <g transform="translate(380 280)"><circle cx="28" cy="20" r="27" fill="#fff" stroke="#8fa79e" /><path d="M16 20h24M28 8v24" stroke="#2f6f6b" strokeWidth="3" strokeLinecap="round" /><text x="68" y="16" fontSize="12" fontWeight="700" letterSpacing="1.2" fill="#24463f">NURSE HUB</text><text x="68" y="37" fontSize="10" fill="#667a73">2 clinicians available · coordination live</text></g>
          {level === 2 ? rows.map((row, index) => <RoomShape key={row.patientId} row={row} room={roomFor(row, index)} active={row.patientId === selected} lens={lens} onSelect={() => onSelect(row.patientId)} onHover={setHovered} />) : <EmptyFloor level={level} />}
        </g>
      </svg>
    </div>
    <div className="absolute bottom-5 left-5 z-20 flex items-center gap-4 rounded-xl border border-white/80 bg-white/90 px-4 py-3 text-[10px] text-dim shadow-sm backdrop-blur-xl"><Legend color="green" label="Stable" /><Legend color="watch" label="Watch" /><Legend color="high" label="Attention" /></div>
    <div className="absolute bottom-5 right-5 z-20 grid overflow-hidden rounded-xl border border-white/80 bg-white/90 shadow-sm backdrop-blur-xl"><Control label="Zoom in" onClick={() => setZoom((value) => Math.min(1.2, value + .07))}><Plus size={15} /></Control><Control label="Zoom out" onClick={() => setZoom((value) => Math.max(.84, value - .07))}><Minus size={15} /></Control><Control label="Reset view" onClick={() => setZoom(1)}><LocateFixed size={15} /></Control><Control label="Fullscreen" onClick={() => void surface.current?.requestFullscreen()}><Maximize2 size={15} /></Control></div>
    <div className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-5 rounded-xl border border-white/80 bg-[#173b35]/95 px-5 py-3 text-white shadow-[0_14px_45px_rgba(17,47,40,.25)] backdrop-blur-xl lg:flex"><Stat icon={<BedDouble size={14} />} value={`${rows.length}`} label="beds observed" /><span className="h-7 w-px bg-white/15" /><Stat icon={<Cross size={14} />} value={`${active}`} label="need attention" /><span className="h-7 w-px bg-white/15" /><Stat icon={<Users size={14} />} value="2" label="staff available" /></div>
    {selectedRow && level === 2 && <div className="pointer-events-none absolute left-1/2 top-[17%] z-30 hidden -translate-x-1/2 rounded-xl border border-white/70 bg-[#112f29]/95 px-4 py-3 text-white shadow-2xl backdrop-blur-xl xl:block"><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-white/55">{selectedRow.room?.replace("room-", "Room ")} · priority #{selectedRow.rank}</p><p className="mt-1 text-[13px] font-semibold">{selectedRow.name}</p><p className="mt-1 max-w-[250px] truncate text-[10px] text-white/65">{selectedRow.reasons[0] ?? "No meaningful change from baseline"}</p></div>}
    {level !== 2 && <div className="absolute inset-0 z-10 flex items-center justify-center"><div className="rounded-2xl border border-white/80 bg-white/90 px-6 py-5 text-center shadow-xl backdrop-blur-xl"><Layers3 className="mx-auto text-[var(--accent)]" size={20} /><p className="mt-3 text-[13px] font-semibold">Level {level} context view</p><p className="mt-1 text-[11px] text-dim">Patient telemetry is active on Level 2.</p><button onClick={() => setLevel(2)} className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">Return to live ward</button></div></div>}
  </div>;
}

function RoomShape({ row, room, active, lens, onSelect, onHover }: { row: QueueRow; room: Room; active: boolean; lens: Lens; onSelect: () => void; onHover: (id: string | null) => void }) {
  const token = row.level === "PERSISTING_CONCERN" ? "concern" : row.level.toLowerCase();
  const color = lens === "occupancy" ? "#9cc9bd" : lens === "movement" ? (row.locationStatus === "bed" ? "#dbe5e1" : "#e9bd72") : `var(--lvl-${token})`;
  const opacity = lens === "trajectory" ? (row.level === "GREEN" ? .15 : .32) : .64;
  const { x, y, w, h } = room;
  return <g role="button" tabIndex={0} aria-label={`${row.name}, ${row.room}, ${row.level}`} onClick={onSelect} onMouseEnter={() => onHover(row.patientId)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(row.patientId)} onBlur={() => onHover(null)} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onSelect()} className="cursor-pointer outline-none">
    <path d={`M${x} ${y}l12 -12h${w}l-12 12z`} fill={active ? "#7e9890" : "#c5d0cc"} /><path d={`M${x + w} ${y}l12 -12v${h}l-12 12z`} fill={active ? "#8ea69e" : "#b7c5c0"} /><rect x={x} y={y} width={w} height={h} rx="3" fill={active ? "#fff" : color} fillOpacity={active ? 1 : opacity} stroke={active ? "#173b35" : "#9eafa8"} strokeWidth={active ? 3 : 1.3} className="transition-all duration-300" />
    <rect x={x + 15} y={y + 20} width="52" height="31" rx="4" fill="#fff" stroke="#a9bab3" /><rect x={x + 20} y={y + 25} width="17" height="9" rx="2" fill="#d8e3df" /><line x1={x + 67} y1={y + 23} x2={x + 67} y2={y + 56} stroke="#718a81" strokeWidth="3" />
    <circle cx={x + w - 24} cy={y + 24} r={active ? 10 : 8} fill={`var(--lvl-${token})`}><animate attributeName="opacity" values={row.level === "CRITICAL" ? "1;.45;1" : "1;1;1"} dur="1.7s" repeatCount="indefinite" /></circle>
    <text x={x + 16} y={y + h - 39} fontSize="9" fontWeight="700" letterSpacing="1" fill="#61756e">ROOM {room.label}</text><text x={x + 16} y={y + h - 18} fontSize="12" fontWeight="700" fill="#17332d">{shortName(row.name)}</text>
    {row.locationStatus !== "bed" && <g transform={`translate(${x + w - 65} ${y + h - 43})`}><rect width="49" height="24" rx="12" fill="#fff1d2" /><text x="24.5" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="#795b27">{row.locationStatus.toUpperCase()}</text></g>}
  </g>;
}

function EmptyFloor({ level }: { level: number }) { return <g opacity=".42">{ROOMS.slice(0, 8).map((room) => <g key={`${level}-${room.label}`}><rect x={room.x} y={room.y} width={room.w} height={room.h} rx="3" fill="#d9e1de" stroke="#9eafa8" /><text x={room.x + 16} y={room.y + room.h - 18} fontSize="10" fontWeight="700" fill="#61756e">L{level} · {room.label}</text></g>)}</g>; }
function roomFor(row: QueueRow, fallbackIndex: number) { const roomNumber = Number(row.room?.match(/\d+/)?.[0]); return ROOMS[roomNumber - 1] ?? ROOMS[fallbackIndex] ?? ROOMS[10]; }
function shortName(name: string) { return name.length > 18 ? `${name.split(" ")[0]} ${name.split(" ").at(-1)?.[0]}.` : name; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: `var(--lvl-${color})` }} />{label}</span>; }
function Control({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) { return <button title={label} aria-label={label} onClick={onClick} className="flex h-9 w-9 items-center justify-center border-b border-line text-dim transition last:border-0 hover:bg-sunk hover:text-ink">{children}</button>; }
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="flex items-center gap-2.5">{icon}<div><p className="text-[11px] font-semibold tabular">{value}</p><p className="text-[8px] uppercase tracking-[.12em] text-white/50">{label}</p></div></div>; }
