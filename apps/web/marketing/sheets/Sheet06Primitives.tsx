import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';
import { PrimitiveSparkline } from './_components/PrimitiveSparkline';

// AI first, the terminal right beside it, then the chrome that holds them.
const PRIMS = [
  { name: 'Assistant', dim: 'overlay', use: 'AI primitive. Reads every app’s intents and acts on them, by text or voice.' },
  { name: 'CommandPalette', dim: '⌘K · 480 px', use: 'Every intent, searchable. The same actions the assistant can take.' },
  { name: 'TerminalDrawer', dim: 'h: 0 / 240px', use: 'A real shell beside the canvas. Describe it in words, get the bash.' },
  { name: 'Canvas', dim: 'fluid', use: 'Pan/zoom workspace. Windows tile themselves as apps open.' },
  { name: 'Frame', dim: '100% × 100%', use: 'Chrome root. Hosts nav, panels, canvas, status.' },
  { name: 'NavigationBar', dim: 'h: 48 px', use: 'Crumbs, ⌘K, install. Always pinned to top.' },
  { name: 'SidePanel', dim: 'w: 280 px', use: 'Manifest, inspector, file tree. Either side.' },
  { name: 'StatusBar', dim: 'h: 28 px', use: 'Live runtime: uptime, intents, logs, version.' },
];

export function Sheet06Primitives() {
  return (
    <Sheet
      id="primitives"
      slugTitle="PRIMITIVES"
      slugSub="reference · all 8"
      sheetTitle="Primitives — Reference Sheet"
      footer={{
        mid: 'PRIMITIVES — REFERENCE SHEET · 8 COMPONENTS',
        right: ['LOC', '~ 2,400'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('primitives')} / Primitives · the kit</Eyebrow>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, marginBottom: 72 }}
        >
          <h2 className="h-section">
            AI-forward primitives, <em>with a terminal at hand</em>.
          </h2>
          <p className="subhead" style={{ fontSize: 17, alignSelf: 'end' }}>
            Every app action is an intent that people and agents share: the assistant, the
            command palette, and any agent you point at Hudson can run it. The terminal drawer
            keeps a real shell one keystroke away, and the chrome around it all is the same on
            iOS, macOS, and the web.
          </p>
        </div>

        <div
          data-cal
          data-cal-label="primitives reference grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
            border: 'var(--stroke-w) solid var(--ink)',
            background: 'var(--paper)',
          }}
        >
          {PRIMS.map((p, i) => (
            <div
              key={p.name}
              style={{
                padding: 20,
                borderRight: i % 4 !== 3 ? '1px solid var(--line-strong)' : 0,
                borderBottom: i < 4 ? '1px solid var(--line-strong)' : 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minHeight: 200,
              }}
            >
              <PrimitiveSparkline name={p.name} />
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  letterSpacing: '0.1em',
                  color: 'var(--ink)',
                  fontWeight: 600,
                }}
              >
                {`<${p.name}/>`}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-2)',
                }}
              >
                {p.dim}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                {p.use}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
