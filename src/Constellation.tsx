'use client';

// Constellation — a moving web of relations.
//
// One thing in the middle; the things connected to it float around it, the
// strongest nearest. Nothing joins the middle directly: every line runs through
// a small junction that stands for what the connected things share (a topic, a
// place, an organisation). Click a name and it travels to the middle, and the
// web rebuilds around it. Point at anything and it comes forward, gently, with
// everything it is connected to. Drag a name out of the cloud and let go: it
// drifts home.
//
// Designed by The Thread — https://thethread.app

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ASPECT,
  assignBearings,
  driftBearings,
  fontSize,
  junctionRadius,
  labelWidth,
  panTo,
  seedPosition,
  settle,
  shortLabel,
  step,
  targetRadius,
  wander,
  type Pan,
  type WebLink,
  type WebNode,
} from './layout';
import { byDepth, depthStyle, easeDepth, parallax, targetDepth, type Focus } from './depth';

/** Something shown around the middle. */
export type ConstellationNode = {
  id: string;
  label: string;
  /** 0..1 — how strong the connection to the middle is. Stronger sits nearer, larger. */
  weight: number;
  /**
   * What this node shares with the middle: the junction its line runs through.
   * Nodes with the same group id hang from the same junction. Omit for a
   * plain "near" junction.
   */
  group?: { id: string; label: string; /** A junction that can be opened is drawn full and named. */ openable?: boolean };
  /** Has content behind it (notes, a profile…): drawn with a filled marker. Default true. */
  full?: boolean;
  /** A recorded tie (solid line) rather than a loose one (dotted). Default true. */
  solid?: boolean;
  /** Drawn as an organisation: a light grey ground with squarer corners. */
  kind?: 'person' | 'organisation';
};

/** A tie between two nodes that are both around the middle. */
export type ConstellationLink = { a: string; b: string; weight: number; solid?: boolean; label?: string };

export type ConstellationProps = {
  /** The thing in the middle. Changing its id glides the clicked node to the centre. */
  center: { id: string; label: string };
  nodes: ConstellationNode[];
  links?: ConstellationLink[];
  /** A name was clicked (the middle included). Typically: make it the new center. */
  onSelect?: (id: string) => void;
  /** A full junction was clicked. */
  onSelectGroup?: (groupId: string) => void;
  className?: string;
  style?: CSSProperties;
  /** Shows a small "Designed by The Thread" link in the corner. Default true. */
  credit?: boolean;
  /** Accessible name for the drawing. */
  ariaLabel?: string;
};

type Shown = WebNode & {
  label: string;
  kind: 'person' | 'organisation' | 'junction';
  strength: number;
  full: boolean;
  solid: boolean;
  openable?: boolean;
  groupId?: string;
  opacity: number;
  leaving?: boolean;
  z?: number;
};

// Colours are CSS variables, so a host page can theme it: set them on any
// ancestor. The fallbacks read on a light background.
const INK = 'var(--cst-ink, #111827)';
const MUTED = 'var(--cst-muted, #6b7280)';
const SUBTLE = 'var(--cst-subtle, #9ca3af)';
const GROUND = 'var(--cst-ground, #ffffff)';
const SUNKEN = 'var(--cst-sunken, #f1f3f5)';

const FADE = 0.05;
const DOTTED = '0.1 4.5';
const MARKER_ROOM = 12;
const BLUR_STEPS = [0.15, 0.3];
const DRAG_SLOP_PX = 5;
const HOLD_MS = 180;
const round = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Constellation({
  center,
  nodes: input,
  links = [],
  onSelect,
  onSelectGroup,
  className,
  style,
  credit = true,
  ariaLabel,
}: ConstellationProps) {
  const nodes = useRef<Map<string, Shown>>(new Map());
  const joinedBy = useRef<Map<string, string>>(new Map());
  const pan = useRef<Pan | undefined>(undefined);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const prevCenter = useRef<string | null>(null);
  const [, setFrame] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{
    id: string; startX: number; startY: number; offsetX: number; offsetY: number;
    held: boolean; moved: boolean; timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const suppressClick = useRef(false);

  const animate = useCallback(() => {
    if (raf.current !== null) return;
    if (reducedMotion()) {
      settle([...nodes.current.values()], 600, webLinks(links), pan.current, null);
      for (const n of nodes.current.values()) n.opacity = n.leaving ? 0 : 1;
      setFrame((f) => f + 1);
      return;
    }
    const tick = () => {
      const list = [...nodes.current.values()];
      driftBearings(list, performance.now());
      step(list, webLinks(links), pan.current, pointer.current);
      wander(list, performance.now());
      for (const n of list) {
        const want = n.leaving ? 0 : 1;
        const next = n.opacity + (want - n.opacity) * FADE;
        n.opacity = Math.abs(want - next) < 0.01 ? want : next;
        if (n.leaving && n.opacity === 0) nodes.current.delete(n.id);
      }
      setFrame((f) => f + 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // links is read fresh each frame through the closure of the latest render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  // Place the middle and everything around it whenever the data changes.
  useEffect(() => {
    const map = nodes.current;
    const clicked = map.get(center.id);
    const moving = prevCenter.current !== null && prevCenter.current !== center.id;
    if (moving && clicked) {
      pan.current = panTo(clicked);
    } else if (!clicked) {
      map.clear();
    }
    prevCenter.current = center.id;

    const maxWeight = Math.max(0.0001, ...input.map((n) => n.weight));
    const keep = new Set([center.id, ...input.map((n) => n.id)]);
    for (const [id, n] of map) if (!keep.has(id) && n.kind !== 'junction') n.leaving = true;

    const mid = map.get(center.id);
    const middle: Shown = Object.assign(mid ?? {
      id: center.id, x: 0, y: 0, vx: 0, vy: 0, opacity: 1,
    }, {
      label: center.label, kind: 'person' as const, centre: true, targetR: 0, strength: 1,
      full: true, solid: true, leaving: false, width: labelWidth(center.label, true, 1),
    }) as Shown;
    map.set(center.id, middle);

    const groups = new Map<string, { label: string; openable: boolean; members: Shown[] }>();
    joinedBy.current = new Map();
    for (const item of input) {
      const strength = item.weight / maxWeight;
      const existing = map.get(item.id);
      const width = labelWidth(item.label, false, strength) + (item.kind === 'organisation' ? 0 : MARKER_ROOM);
      const base = {
        label: item.label,
        kind: item.kind ?? ('person' as const),
        strength,
        full: item.full ?? true,
        solid: item.solid ?? true,
        centre: false,
        targetR: targetRadius(strength, 1),
        width,
        leaving: false,
      };
      const node: Shown = existing
        ? Object.assign(existing, base)
        : ({ id: item.id, ...seedPosition(item.id, middle), vx: 0, vy: 0, opacity: 0, ...base } as Shown);
      map.set(item.id, node);
      const g = item.group ?? { id: '__near', label: '' };
      const jid = `junction:${g.id}`;
      const group = groups.get(jid) ?? { label: g.label, openable: Boolean(g.openable), members: [] };
      group.members.push(node);
      groups.set(jid, group);
      joinedBy.current.set(item.id, jid);
    }

    for (const [id, n] of map) if (n.kind === 'junction' && !groups.has(id)) n.leaving = true;

    const placed = [...groups.entries()].map(([jid, g]) => {
      let j = map.get(jid);
      if (!j) {
        j = {
          id: jid, x: middle.x, y: middle.y, vx: 0, vy: 0, opacity: 0, centre: false,
          junction: true, width: 10, kind: 'junction', label: g.label, strength: 0.5,
          full: g.openable, solid: true, targetR: 0,
        } as Shown;
        map.set(jid, j);
      }
      j.leaving = false;
      j.label = g.label;
      j.openable = g.openable;
      j.full = g.openable;
      j.groupId = jid.slice('junction:'.length);
      j.targetR = junctionRadius(g.members.map((m) => m.targetR));
      return { junction: j, members: g.members };
    });
    assignBearings(placed);
    animate();
  }, [center.id, center.label, input, animate]);

  // ── Drawing ──────────────────────────────────────────────────────────────
  const shown = [...nodes.current.values()];
  const middle = nodes.current.get(center.id);
  const around = shown.filter((n) => !n.centre);
  const byId = new Map(shown.map((n) => [n.id, n]));

  const hovered = hover ? byId.get(hover) : undefined;
  const related = new Set<string>();
  if (hovered && !hovered.leaving) {
    related.add(hovered.id);
    if (middle) related.add(middle.id);
    if (hovered.junction) {
      for (const [nid, jid] of joinedBy.current) if (jid === hovered.id) related.add(nid);
    } else if (hovered.centre) {
      for (const n of shown) if (n.junction) related.add(n.id);
    } else {
      const j = joinedBy.current.get(hovered.id);
      if (j) related.add(j);
      for (const l of links) {
        if (l.a === hovered.id) related.add(l.b);
        if (l.b === hovered.id) related.add(l.a);
      }
    }
  }
  const focusOf = (n: Shown): Focus =>
    !hovered || hovered.leaving ? null : n.id === hovered.id ? 'self' : related.has(n.id) ? 'related' : 'other';
  const still = typeof window !== 'undefined' && reducedMotion();
  for (const n of shown) {
    const want = targetDepth({ centre: n.centre, junction: n.junction, strength: n.strength, full: n.full }, focusOf(n));
    n.z = still ? want : easeDepth(n.z, want);
  }
  const lean = still ? null : pointer.current;
  const at = (n: Shown | undefined) => {
    if (!n) return { x: 0, y: 0 };
    const p = parallax(n.z ?? 1, lean);
    return { x: n.x + p.dx, y: n.y + p.dy };
  };
  const lit = (a?: Shown, b?: Shown) =>
    !hovered ? 1 : a && b && related.has(a.id) && related.has(b.id) ? 1.5 : 0.75;

  const svgPoint = (e: { clientX: number; clientY: number }) => {
    const ctm = svg.current?.getScreenCTM();
    return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null;
  };

  const release = (moved: boolean) => {
    const d = drag.current;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    const node = byId.get(d.id);
    if (node) {
      node.held = false;
      if (node.centre && moved) {
        node.homeX = node.x;
        node.homeY = node.y;
      }
      if (!node.centre && moved) node.returning = 0;
    }
    suppressClick.current = moved;
    drag.current = null;
  };

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <svg
        ref={svg}
        viewBox="-620 -300 1240 600"
        role="img"
        aria-label={ariaLabel ?? center.label}
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', userSelect: 'none', fontFamily: 'inherit' }}
        onPointerMove={(e) => {
          const p = svgPoint(e);
          if (!p) return;
          pointer.current = { x: p.x, y: p.y };
          const d = drag.current;
          if (!d) return;
          const node = byId.get(d.id);
          if (!node) return;
          if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_SLOP_PX) {
            d.moved = true;
            d.held = true;
          }
          if (!d.held) return;
          node.x = p.x + d.offsetX;
          node.y = p.y + d.offsetY;
          node.held = true;
        }}
        onPointerUp={() => release(Boolean(drag.current?.moved))}
        onPointerLeave={() => {
          pointer.current = null;
          release(Boolean(drag.current?.moved));
        }}
      >
        <defs>
          {BLUR_STEPS.map((sd, i) => (
            <filter key={sd} id={`cst-far-${i}`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation={sd} />
            </filter>
          ))}
        </defs>

        {/* Ties between the nodes around the middle: faintest, the shape of the group. */}
        {links.map((l) => {
          const a = byId.get(l.a);
          const b = byId.get(l.b);
          if (!a || !b || a.centre || b.centre) return null;
          const pa = at(a);
          const pb = at(b);
          const k = lit(a, b);
          const solid = l.solid ?? false;
          return (
            <line key={`x-${l.a}-${l.b}`} x1={round(pa.x)} y1={round(pa.y)} x2={round(pb.x)} y2={round(pb.y)}
              stroke={INK}
              strokeOpacity={Math.min(1, (0.1 + 0.18 * Math.min(1, l.weight)) * Math.min(a.opacity, b.opacity) * k)}
              strokeWidth={(0.8 + 1.2 * Math.min(1, l.weight)) * (k > 1 ? 1.2 : 1)}
              strokeDasharray={solid ? undefined : DOTTED} strokeLinecap={solid ? undefined : 'round'}>
              {l.label && <title>{l.label}</title>}
            </line>
          );
        })}
        {/* Middle to each junction. */}
        {around.filter((n) => n.junction).map((j) => {
          const c = at(middle);
          const q = at(j);
          const k = lit(middle, j);
          return (
            <line key={`j-${j.id}`} x1={round(c.x)} y1={round(c.y)} x2={round(q.x)} y2={round(q.y)}
              stroke={INK} strokeOpacity={Math.min(1, 0.3 * j.opacity * k)} strokeWidth={k > 1 ? 1.7 : 1.4} />
          );
        })}
        {/* Junction to each name. */}
        {around.filter((n) => !n.junction).map((n) => {
          const from = byId.get(joinedBy.current.get(n.id) ?? '') ?? middle;
          const f = at(from);
          const q = at(n);
          const k = lit(from, n);
          return (
            <line key={`l-${n.id}`} x1={round(f.x)} y1={round(f.y)} x2={round(q.x)} y2={round(q.y)}
              stroke={INK}
              strokeOpacity={Math.min(1, (0.18 + 0.4 * n.strength) * Math.min(n.opacity, from?.opacity ?? 1) * k)}
              strokeWidth={(1 + 2 * n.strength) * (k > 1 ? 1.15 : 1)}
              strokeDasharray={n.solid ? undefined : DOTTED} strokeLinecap={n.solid ? undefined : 'round'} />
          );
        })}
        {/* Junctions: full (named, clickable) or empty (hollow, named on hover). */}
        {byDepth(around.filter((n) => n.junction), (n) => n.z ?? 0.55).map((j) => {
          const q = at(j);
          const st = depthStyle(j.z ?? 0.55);
          const named = j.full && j.label;
          return (
            <g key={j.id} opacity={j.opacity * st.opacity}
              transform={`translate(${round(q.x)} ${round(q.y)}) scale(${round3(st.scale)})`}
              style={{ cursor: j.full ? 'pointer' : undefined }}
              onMouseEnter={() => setHover(j.id)}
              onMouseLeave={() => setHover((h) => (h === j.id ? null : h))}
              onClick={() => j.full && j.groupId && onSelectGroup?.(j.groupId)}>
              <circle r={11} fill="transparent" />
              {j.full
                ? <circle r={4.5} fill={MUTED} stroke={GROUND} strokeWidth={1.2} />
                : <circle r={3.5} fill={GROUND} stroke={MUTED} strokeWidth={1.2} />}
              {named && hover !== j.id && (
                <text y={-10} textAnchor="middle" fontSize={10.5} fill={MUTED} style={{ pointerEvents: 'none' }}>
                  {truncate(j.label, 24)}
                </text>
              )}
              {j.label && <title>{j.label}</title>}
            </g>
          );
        })}
        {/* Names, far first so near ones are painted over them. */}
        {byDepth(shown.filter((n) => !n.junction), (n) => n.z ?? 1).map((n) => {
          const q = at(n);
          const st = depthStyle(n.z ?? 1, n.centre);
          const blur = st.blur ? Math.min(BLUR_STEPS.length - 1, Math.floor(st.blur / 0.15)) : -1;
          const marker = !n.centre && n.kind === 'person';
          const drawn = shortLabel(n.label, n.centre);
          return (
            <g key={n.id} role="button" aria-label={n.label}
              transform={`translate(${round(q.x)} ${round(q.y)}) scale(${round3(st.scale)})`}
              opacity={n.opacity * st.opacity}
              filter={blur >= 0 ? `url(#cst-far-${blur})` : undefined}
              style={{ cursor: n.held ? 'grabbing' : 'pointer' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => {
                const p = svgPoint(e);
                if (drag.current?.timer) clearTimeout(drag.current.timer);
                const d = {
                  id: n.id, startX: e.clientX, startY: e.clientY,
                  offsetX: p ? n.x - p.x : 0, offsetY: p ? n.y - p.y : 0,
                  held: false, moved: false, timer: null as ReturnType<typeof setTimeout> | null,
                };
                d.timer = setTimeout(() => {
                  if (drag.current === d) d.held = true;
                }, HOLD_MS);
                drag.current = d;
              }}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onSelect?.(n.id);
              }}>
              <rect x={-n.width / 2} y={n.centre ? -20 : -13} width={n.width} height={n.centre ? 40 : 26}
                rx={n.kind === 'organisation' ? 6 : 13} fill={n.kind === 'organisation' ? SUNKEN : GROUND} />
              {marker && (
                <circle cx={-n.width / 2 + 11} cy={0} r={3}
                  fill={n.full ? MUTED : 'transparent'} stroke={n.full ? undefined : SUBTLE} strokeWidth={n.full ? 0 : 1.2} />
              )}
              <text textAnchor="middle" x={marker ? MARKER_ROOM / 2 : 0} y={n.centre ? 7 : 5}
                fontSize={fontSize(n.strength, n.centre)} fontWeight={n.centre ? 600 : 500}
                fill={marker && !n.full ? MUTED : INK}>
                {drawn || '…'}
                {drawn !== n.label && <title>{n.label}</title>}
              </text>
            </g>
          );
        })}
        {/* The hovered junction's name, on top of everything. */}
        {(() => {
          if (!hovered || !hovered.junction || !hovered.label || hovered.leaving) return null;
          const q = at(hovered);
          const w = hovered.label.length * 6.4 + 14;
          return (
            <g transform={`translate(${round(q.x)} ${round(q.y)})`} style={{ pointerEvents: 'none' }}>
              <rect x={-w / 2} y={-30} width={w} height={19} rx={9} fill={GROUND} stroke={SUBTLE} strokeWidth={1} />
              <text textAnchor="middle" y={-16} fontSize={12} fill={MUTED}>{hovered.label}</text>
            </g>
          );
        })()}
      </svg>
      {credit && (
        <a href="https://thethread.app" target="_blank" rel="noopener noreferrer"
          style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, color: SUBTLE, textDecoration: 'none' }}>
          Designed by The Thread
        </a>
      )}
    </div>
  );
}

function webLinks(links: ConstellationLink[]): WebLink[] {
  return links.map((l) => ({ a: l.a, b: l.b, weight: l.weight }));
}

export { ASPECT };
