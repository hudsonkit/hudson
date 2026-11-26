import { Sheet } from '@/marketing/primitives/Sheet';
import { AppCard, type AppCardData } from './_components/AppCard';

const APPS: AppCardData[] = [
  {
    id: 'talkie',
    name: 'Talkie',
    tag: 'ios · macos',
    lede: 'Dictation, notes, and meeting capture.',
    body: 'Dictate into Claude Code, Slack, or Mail, record memos, and transcribe meetings. Each capture keeps its screen, ready to search or hand to an agent.',
    accent: 'oklch(0.74 0.12 262)',
    icon: '/marketing/apps/talkie.png',
    source: 'https://github.com/arach/usetalkie.com',
    href: 'https://talkie.to',
  },
  {
    id: 'scout',
    name: 'OpenScout',
    tag: 'macos · web',
    lede: 'Agents, software, and people, working together.',
    body: 'Open-source software for putting agents to work. Every agent runs on one core runtime and connects through the OpenScout platform.',
    accent: 'oklch(0.92 0.02 85)',
    icon: '/marketing/apps/scout.png',
    source: 'https://github.com/arach/scout',
    href: 'https://openscout.app',
  },
  {
    id: 'linea',
    name: 'Linea',
    tag: 'macos · web',
    lede: 'Read more, more often.',
    body: 'A visual reader for documents and papers. Open a PDF or a link and read it with highlights, notes, and drawn marks in place.',
    accent: 'oklch(0.62 0.15 40)',
    icon: '/marketing/apps/linea.png',
    href: 'https://lineareads.com',
  },
  {
    id: 'lattices',
    name: 'Lattices',
    tag: 'macos',
    lede: 'Take control of your workspace.',
    body: 'Windows, terminals, and projects under one control surface, with the same workspace controls for your agents on every computer you connect. Free and open source.',
    accent: 'oklch(0.68 0.17 35)',
    icon: '/marketing/apps/lattices.png',
    source: 'https://github.com/arach/lattices',
    href: 'https://lattices.dev',
  },
];

export function Sheet05Apps() {
  return (
    <Sheet
      id="apps"
      slugTitle="APPS GALLERY"
      slugSub="real software, public"
      sheetTitle="Apps Built on Hudson"
      footer={{
        mid: 'APPS GALLERY · BUILT ON HUDSON KIT',
        right: ['APPS', String(APPS.length)],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, marginBottom: 72 }}
        >
          <h2 className="h-section">
            Four apps,
            <br />
            <em>one</em> kit.
          </h2>
          <p className="subhead" style={{ fontSize: 17, alignSelf: 'end' }}>
            Each ships independently — its own brand, its own scope, its own audience. They share
            Hudson the way print designers share a type system: identical bones, distinct
            identities.
          </p>
        </div>

        <div
          data-cal
          data-cal-label="apps gallery grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32 }}
        >
          {APPS.map((a, i) => (
            <AppCard key={a.id} app={a} index={i + 1} />
          ))}
        </div>
      </div>
    </Sheet>
  );
}
