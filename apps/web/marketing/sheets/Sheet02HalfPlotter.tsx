'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { PLOTTER_FONT } from '@/marketing/lib/plotter-font';
import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';
import {
  PLOTTER_GLYPH_BOX_H,
  PLOTTER_H,
  PLOTTER_LETTER_GAP,
  PLOTTER_PAD,
  PLOTTER_W,
  PlotterCanvas,
  type PlotterAccent,
} from './_components/PlotterCanvas';
import { PlotterControls } from './_components/PlotterControls';

const CAP = 18;
const PRESETS = ['DRAWN TO SPEC', 'HUDSON', 'BUILT IN PUBLIC', 'WORKSPACE 01', 'PRECISION'];

export function Sheet02HalfPlotter() {
  const [phrase, setPhrase] = useState('DRAWN TO SPEC');
  const [draftPhrase, setDraftPhrase] = useState('DRAWN TO SPEC');
  const [speed, setSpeed] = useState(420);
  const [weight, setWeight] = useState(0.7);
  const [jitter, setJitter] = useState(0.4);
  const [accent, setAccent] = useState<PlotterAccent>('ink');
  const [paperTone, setPaperTone] = useState('var(--paper, oklch(0.96 0.005 200))');
  const [runId, setRunId] = useState(1);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const plotterRef = useRef<SVGSVGElement | null>(null);

  const replot = useCallback(() => {
    setDone(false);
    setProgress(0);
    setRunId((id) => id + 1);
  }, []);

  const commit = useCallback(
    (val: string) => {
      const next = val.slice(0, CAP);
      setDraftPhrase(next);
      if (next !== phrase) {
        setPhrase(next);
        setDone(false);
        setProgress(0);
        setRunId((id) => id + 1);
      } else {
        replot();
      }
    },
    [phrase, replot],
  );

  const downloadSVG = useCallback(() => {
    if (!plotterRef.current) return;
    const cloned = plotterRef.current.cloneNode(true) as SVGSVGElement;
    cloned.querySelectorAll('[data-tip]').forEach((n) => n.remove());
    const xml = new XMLSerializer().serializeToString(cloned);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + xml], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hudson-plot-${String(runId).padStart(3, '0')}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [runId]);

  const scale = useMemo(() => {
    if (!phrase.length) return 1.6;
    const upper = phrase.toUpperCase();
    let raw = 0;
    for (const ch of upper) {
      const g = PLOTTER_FONT[ch] ?? PLOTTER_FONT[' '];
      raw += g.advance + PLOTTER_LETTER_GAP;
    }
    raw = Math.max(1, raw - PLOTTER_LETTER_GAP);

    const availW = PLOTTER_W - 2 * (PLOTTER_PAD + 80);
    const availH = PLOTTER_H * 0.55;
    const widthFit = availW / raw;
    const heightFit = availH / PLOTTER_GLYPH_BOX_H;
    const fit = Math.min(widthFit, heightFit);
    return Math.max(0.55, Math.min(1.85, fit));
  }, [phrase]);

  return (
    <Sheet
      id="plotter"
      slugTitle="THE PLOTTER"
      slugSub="phrase → drafting specimen"
      sheetTitle="Drafting Plotter — HP-7475A EMU"
      footer={{
        left: ['INSTRUMENT', 'SVG · 1100 × 620'],
        mid: 'Hudson Plotter — type a phrase, get a specimen.',
        right: ['EXPORT', 'SVG · DXF (soon)'],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0', position: 'relative' }}>
        <div style={{ marginBottom: 16 }}>
          <Eyebrow>{sheetNumber('plotter')} / Interactive plotter</Eyebrow>
        </div>

        <div
          className="reflow-stack"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 32,
            alignItems: 'start',
          }}
        >
          <div>
            <h2 className="h-section" style={{ marginBottom: 14, maxWidth: '16ch' }}>
              Describe something. <em>It appears on the canvas</em>.
            </h2>
            <p className="subhead" style={{ marginBottom: 28, maxWidth: '52ch' }}>
              A virtual pen plotter renders your words in single-stroke drafting type, then
              dimensions the result like an engineering specimen. Download the SVG and use it however.
            </p>

            <div
              className="embed-plate"
              data-cal
              data-cal-label="plotter canvas"
              style={{
                aspectRatio: `${PLOTTER_W} / ${PLOTTER_H}`,
                background: 'var(--paper)',
                position: 'relative',
              }}
            >
              <div className="embed-plate__caption">
                <span className="live" />
                <span>PLOT · LIVE · {Math.round(progress * 100)}%</span>
                <span style={{ marginLeft: 12, color: 'var(--ink-2)' }}>
                  {done ? 'PEN UP · READY' : 'PEN DOWN · DRAWING'}
                </span>
              </div>
              <span className="embed-plate__corner embed-plate__corner--tl" />
              <span className="embed-plate__corner embed-plate__corner--tr" />
              <span className="embed-plate__corner embed-plate__corner--bl" />
              <span className="embed-plate__corner embed-plate__corner--br" />
              <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                <PlotterCanvas
                  phrase={phrase}
                  speed={speed}
                  weight={weight}
                  jitter={jitter}
                  scale={scale}
                  paperTone={paperTone}
                  accent={accent}
                  runId={runId}
                  onProgress={setProgress}
                  onDone={() => setDone(true)}
                  plotterRef={plotterRef}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
              }}
            >
              <span>TRAVEL</span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  border: '1px solid var(--ink)',
                  background: 'var(--paper-2)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${progress * 100}%`,
                    background: 'var(--accent)',
                    transition: 'width 0.06s linear',
                  }}
                />
              </div>
              <span style={{ color: 'var(--ink)' }}>
                {Math.round(progress * 100).toString().padStart(3, '0')} / 100
              </span>
            </div>
          </div>

          <PlotterControls
            draftPhrase={draftPhrase}
            setDraftPhrase={setDraftPhrase}
            commit={commit}
            cap={CAP}
            speed={speed}
            setSpeed={setSpeed}
            weight={weight}
            setWeight={setWeight}
            jitter={jitter}
            setJitter={setJitter}
            accent={accent}
            setAccent={setAccent}
            paperTone={paperTone}
            setPaperTone={setPaperTone}
            replot={replot}
            downloadSVG={downloadSVG}
            done={done}
            presets={PRESETS}
          />
        </div>
      </div>
    </Sheet>
  );
}
