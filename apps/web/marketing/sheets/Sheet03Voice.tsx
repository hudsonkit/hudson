'use client';

import { useState } from 'react';
import { PlotterReveal } from '@/marketing/lib/fx';
import { HudsonEmbed } from '@/marketing/lib/embed';
import { EmbedFrame } from '@/marketing/primitives/EmbedFrame';
import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';

const SPEC: Array<[string, string, boolean?]> = [
  ['CAPTURE', 'useVoiceInput'],
  ['TRANSCRIBE', 'voxProbe · stt'],
  ['MATCH', 'IntentIndex'],
  ['CONFIRM', 'Assistant'],
  ['DISPATCH', 'command.run', true],
  ['REPLY', 'voiceReply'],
];

const FEATURES = [
  { n: '⌘K', t: 'Command palette', b: 'Every intent fuzzy-searched. Open with ⌘K, type three letters, hit return.' },
  { n: '🎤', t: 'Voice', b: 'Tap-and-hold or hotword. Same intents, no extra wiring per surface.' },
  { n: '↳', t: 'Replies', b: 'Assistant reads the result back if the intent declares a voice reply.' },
];

export function Sheet03Voice() {
  const [step, setStep] = useState(0);
  return (
    <Sheet
      id="voice"
      slugTitle="VOICE LOOP"
      slugSub="signal flow"
      sheetTitle="Voice → Intent → Command"
      footer={{
        mid: 'VOICE LOOP · signal flow',
        right: ['LATENCY', '< 80 ms'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('voice')} / Voice loop · sub-80ms</Eyebrow>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 80,
            alignItems: 'start',
            marginBottom: 72,
          }}
        >
          <h2 className="h-section">
            Speak. The chrome <em>understands</em>.
          </h2>
          <p className="subhead" style={{ alignSelf: 'end', fontSize: 16 }}>
            Every intent you declare is searchable — by keystroke, by ⌘K, and by voice. Hudson
            handles the loop: capture, transcribe, match, dispatch. Your app gets a typed call.
          </p>
        </div>

        <div
          className="reflow-stack"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 360px',
            gap: 40,
            alignItems: 'start',
            marginBottom: 72,
          }}
        >
          <div data-cal data-cal-label="voice setup" style={{ position: 'relative' }}>
            <div className="embed-plate__caption">
              <span className="live" />
              EMBED · app = hudson/voice · status: live
            </div>
            <EmbedFrame height={460} padding={0}>
              <HudsonEmbed
                src="/embed/hudson/voice"
                surface="voice"
                sizing={{ mode: 'fill' }}
                density="comfy"
                template="drafting"
                consumerId="hudsonos"
                title="Hudson voice · getting started"
              />
            </EmbedFrame>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="spec" data-cal data-cal-label="signal-flow spec">
              <div className="spec__row spec__row--header">
                <div>Stage</div>
                <div>Primitive</div>
              </div>
              {SPEC.map(([k, v, a]) => (
                <div key={k} className="spec__row">
                  <div className="spec__k">{k}</div>
                  <div className={'spec__v' + (a ? ' spec__v--accent' : '')}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <Eyebrow>What it gives you</Eyebrow>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {FEATURES.map((p, i) => (
            <PlotterReveal
              key={p.t}
              label={`CARD ${String(i + 1).padStart(2, '0')}`}
              enabled={i <= step}
              onDone={() => setStep((s) => Math.max(s, i + 1))}
            >
              <div
                data-cal
                data-cal-label={p.t}
                className="hud-card"
                style={{
                  border: 'var(--stroke-w) solid var(--ink)',
                  background: 'var(--paper)',
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 18,
                    color: 'var(--accent-deep)',
                  }}
                >
                  {p.n}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-2)',
                  }}
                >
                  {p.t}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55 }}>{p.b}</p>
              </div>
            </PlotterReveal>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
