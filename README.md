# Constellation

**A moving web of relations for React.** One thing in the middle — a person, an
organisation, a topic — and the things connected to it floating around it, the
strongest nearest. Click a name and it glides to the middle while the web
rebuilds around it. Point at anything and it comes forward, gently, with
everything it is connected to. Drag a name out of the cloud and let go: it drifts
home.

**Live demo:** https://thefibre.github.io/constellation/

*Designed by [The Thread](https://thethread.app).*

---

## Why it looks the way it does

- **Nothing joins the middle directly.** Every line runs through a small
  *junction* that stands for what the connected things share — a topic, an
  organisation, a stated relationship. People who share one thing hang from one
  junction, so you see the grouping before you read a word.
- **Full and empty.** A name with something behind it (notes, a profile) has a
  filled marker; one that is only there for the overview has a hollow one. A
  junction you can open is filled and named; one that only groups is a small
  hollow ring, named on hover.
- **Solid and dotted.** A solid line is a recorded tie. A dotted line is only
  something two people share — sharing a word is not knowing someone.
- **Depth, subtly.** Strong connections and things with content sit a little
  nearer: a few percent larger and brighter, drifting slightly more with the
  mouse. It is a hint of depth, never a statement.
- **Always a little alive.** The cloud breathes, names slowly trade places, and
  each name follows the middle at its own pace, so the strings stretch
  independently.
- **Calm by default.** Names fade in and out rather than blinking; long names
  are abbreviated ("European Collective of Commons Gardens" → "ECCG"); and with
  `prefers-reduced-motion` the web settles once and stays still.

## Install

```bash
npm install @thefibre/constellation
```

React 18 or later. No other runtime dependencies; it draws plain SVG.

## Use

```tsx
import { useMemo, useState } from 'react';
import { Constellation } from '@thefibre/constellation';

function Web() {
  const [center, setCenter] = useState({ id: 'mira', label: 'Mira Okafor' });

  // Memoise: a new array on every render restarts the placement.
  const nodes = useMemo(
    () => [
      { id: 'jonas', label: 'Jonas Verhoeven', weight: 0.9, solid: true,
        group: { id: 'spring', label: 'Co-hosted the spring gathering' } },
      { id: 'lea', label: 'Lea Santos', weight: 0.6, solid: false, full: false,
        group: { id: '#deep-listening', label: '#deep-listening', openable: true } },
      { id: 'atelier', label: 'Atelier for Slow Cities', kind: 'organisation', weight: 1,
        group: { id: 'atelier', label: 'Works at', openable: true } },
    ],
    [center.id],
  );

  return (
    <Constellation
      center={center}
      nodes={nodes}
      links={[{ a: 'jonas', b: 'lea', weight: 0.4, label: 'Named together' }]}
      onSelect={(id) => {
        /* look the node up and make it the new center */
      }}
    />
  );
}
```

### Props

| Prop | Type | |
|---|---|---|
| `center` | `{ id, label }` | The thing in the middle. Changing it glides the clicked node to the centre. |
| `nodes` | `ConstellationNode[]` | What floats around it (below). |
| `links` | `{ a, b, weight, solid?, label? }[]` | Ties between nodes that are both on screen. |
| `onSelect` | `(id) => void` | A name was clicked — usually: make it the new center. |
| `onSelectGroup` | `(groupId) => void` | A full (openable) junction was clicked. |
| `credit` | `boolean` | The small "Designed by The Thread" link. Default `true`. |
| `className`, `style`, `ariaLabel` | | For the wrapper and the drawing. |

**`ConstellationNode`**: `id`, `label`, `weight` (0–1, strength of the tie to the
middle), `group?` (`{ id, label, openable? }` — the junction its line runs
through), `full?` (has content, default `true`), `solid?` (recorded tie, default
`true`), `kind?` (`'person' | 'organisation'`).

### Theming

Colours are CSS variables with light defaults. Set them on any ancestor:

```css
.my-map {
  --cst-ink: #e5e7eb;      /* names and lines */
  --cst-muted: #9ca3af;    /* junctions, secondary text */
  --cst-subtle: #6b7280;   /* hollow markers, the credit */
  --cst-ground: #111827;   /* behind a name */
  --cst-sunken: #1f2937;   /* behind an organisation */
}
```

### The engine on its own

The layout and depth are plain TypeScript with no DOM, exported for anyone who
wants to draw the web another way (canvas, WebGL, another framework):
`step`, `settle`, `wander`, `driftBearings`, `assignBearings`, `panTo`,
`targetRadius`, `junctionRadius`, `labelWidth`, `shortLabel`, `targetDepth`,
`easeDepth`, `depthStyle`, `parallax`, `byDepth`.

## Develop

```bash
npm install
npm run dev     # the demo, with hot reload
npm test        # the layout and depth tests
npm run build   # dist/
```

## Licence and credit

MIT — see [LICENSE](LICENSE). Use it, change it, ship it. Please keep the
copyright notice and the design credit to The Thread with it; the on-screen
credit link can be switched off with `credit={false}`.

Constellation began as the relationship map inside
[The Thread](https://thethread.app)'s Connections app.
