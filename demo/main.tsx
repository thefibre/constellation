import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Constellation, type ConstellationLink, type ConstellationNode } from '../src';

// A small, entirely fictional community. Every name here is invented.
type Person = { id: string; name: string; kind?: 'person' | 'organisation'; notes?: boolean };
const PEOPLE: Person[] = [
  { id: 'mira', name: 'Mira Okafor', notes: true },
  { id: 'jonas', name: 'Jonas Verhoeven', notes: true },
  { id: 'lea', name: 'Lea Santos' },
  { id: 'tomas', name: 'Tomás Lindqvist', notes: true },
  { id: 'ada', name: 'Ada Nwosu' },
  { id: 'kai', name: 'Kai Moreau', notes: true },
  { id: 'noor', name: 'Noor Haddad' },
  { id: 'ines', name: 'Inês Carvalho', notes: true },
  { id: 'ruben', name: 'Ruben de Wit' },
  { id: 'saoirse', name: 'Saoirse Byrne', notes: true },
  { id: 'atelier', name: 'Atelier for Slow Cities', kind: 'organisation' },
  { id: 'commons', name: 'European Collective of Commons Gardens', kind: 'organisation' },
];

// Who is tied to whom, and through what.
const TIES: [string, string, number, string, boolean][] = [
  ['mira', 'jonas', 0.9, 'Co-hosted the spring gathering', true],
  ['mira', 'lea', 0.6, '#deep-listening', false],
  ['mira', 'tomas', 0.7, '#deep-listening', false],
  ['mira', 'atelier', 1, 'Works at', true],
  ['mira', 'kai', 0.4, 'Named in the same note', false],
  ['jonas', 'ada', 0.8, '#urban-gardens', false],
  ['jonas', 'commons', 1, 'Board member', true],
  ['jonas', 'ruben', 0.5, '#urban-gardens', false],
  ['jonas', 'noor', 0.6, 'Introduced by Mira', true],
  ['lea', 'ines', 0.7, '#retreats', false],
  ['lea', 'saoirse', 0.8, '#retreats', false],
  ['lea', 'tomas', 0.5, '#deep-listening', false],
  ['tomas', 'kai', 0.9, 'Studio partners', true],
  ['ada', 'commons', 1, 'Coordinator', true],
  ['ada', 'noor', 0.6, '#urban-gardens', false],
  ['kai', 'atelier', 1, 'Designer', true],
  ['ines', 'saoirse', 0.9, 'Wrote the retreat guide together', true],
  ['ruben', 'commons', 1, 'Volunteer', true],
  ['noor', 'saoirse', 0.4, '#retreats', false],
];

const byId = new Map(PEOPLE.map((p) => [p.id, p]));

function neighbourhood(centerId: string) {
  const nodes: ConstellationNode[] = [];
  for (const [a, b, weight, why, solid] of TIES) {
    if (a !== centerId && b !== centerId) continue;
    const other = byId.get(a === centerId ? b : a)!;
    const topic = why.startsWith('#') ? why : solid ? why : 'Named together';
    nodes.push({
      id: other.id,
      label: other.name,
      weight,
      kind: other.kind ?? 'person',
      full: other.kind === 'organisation' || Boolean(other.notes),
      solid,
      group: {
        id: why.startsWith('#') ? why : `${other.id}:${why}`,
        label: topic,
        openable: why.startsWith('#') || other.kind === 'organisation',
      },
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const links: ConstellationLink[] = TIES.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, weight, label, solid]) => ({
    a, b, weight, label, solid,
  }));
  return { nodes, links };
}

function Demo() {
  const [centerId, setCenterId] = useState('mira');
  const [trail, setTrail] = useState<string[]>([]);
  const { nodes, links } = useMemo(() => neighbourhood(centerId), [centerId]);
  const center = byId.get(centerId)!;

  return (
    <>
      <div className="row">
        <button type="button" disabled={!trail.length} onClick={() => {
          const prev = trail[trail.length - 1];
          if (!prev) return;
          setTrail((t) => t.slice(0, -1));
          setCenterId(prev);
        }}>← Back</button>
        <span>In the middle: <strong>{center.name}</strong></span>
      </div>
      <div className="stage">
        <Constellation
          center={{ id: center.id, label: center.name }}
          nodes={nodes}
          links={links}
          onSelect={(id) => {
            if (id === centerId) return;
            setTrail((t) => [...t, centerId]);
            setCenterId(id);
          }}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
