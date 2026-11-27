'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, Focus, Type, Grid3X3 } from 'hudsonkit/icons';
import { effectiveTokens, tokenSwatchValue, type ThemeMode } from './model';
import { useThemeDesigner } from './ThemeDesignerProvider';

function styleFromTokens(tokens: Record<string, string>): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (key === 'color-scheme') {
      style.colorScheme = value;
      continue;
    }
    style[key] = value;
  }
  return style as CSSProperties;
}

function readRgb(cssColor: string): [number, number, number] | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('span');
  el.style.color = cssColor;
  el.style.position = 'absolute';
  el.style.pointerEvents = 'none';
  el.style.opacity = '0';
  document.body.appendChild(el);
  const color = getComputedStyle(el).color;
  el.remove();
  const match = color.match(/rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const convert = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function ContrastPair({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const fgRgb = readRgb(fg);
      const bgRgb = readRgb(bg);
      if (!fgRgb || !bgRgb) {
        if (!cancelled) setRatio(null);
        return;
      }
      const a = luminance(fgRgb);
      const b = luminance(bgRgb);
      if (!cancelled) setRatio((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [fg, bg]);

  const ok = ratio !== null && ratio >= 4.5;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`font-mono text-[11px] ${ok ? 'text-success' : 'text-warning'}`}>
        {ratio ? `${ratio.toFixed(2)}:1` : '—'}
      </span>
    </div>
  );
}

function PreviewButton({ label, token, variant }: { label: string; token: string; variant: 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive' }) {
  const { setSelectedToken } = useThemeDesigner();
  const classes = {
    primary: 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
    accent: 'border-accent bg-accent text-accent-foreground hover:bg-accent/90',
    ghost: 'border-border bg-transparent text-foreground hover:bg-muted',
    destructive: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90',
  }[variant];

  return (
    <button
      type="button"
      onClick={() => setSelectedToken(token)}
      className={`rounded-md border px-3 py-2 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${classes}`}
    >
      {label}
    </button>
  );
}

function StatusPill({ kind, label, icon: Icon, token }: { kind: 'success' | 'warning' | 'destructive' | 'info'; label: string; icon: typeof CheckCircle2; token: string }) {
  const { setSelectedToken } = useThemeDesigner();
  const classes = {
    success: 'border-success/45 bg-success/10 text-success',
    warning: 'border-warning/45 bg-warning/10 text-warning',
    destructive: 'border-destructive/45 bg-destructive/10 text-destructive',
    info: 'border-info/45 bg-info/10 text-info',
  }[kind];
  return (
    <button
      type="button"
      onClick={() => setSelectedToken(token)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider ${classes}`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function Badge({ children, token = '--accent' }: { children: React.ReactNode; token?: string }) {
  const { setSelectedToken } = useThemeDesigner();
  return (
    <button
      type="button"
      onClick={() => setSelectedToken(token)}
      className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-accent"
    >
      {children}
    </button>
  );
}

function PrimitivePreview({ mode, split = false }: { mode: ThemeMode; split?: boolean }) {
  const designer = useThemeDesigner();
  const template = designer.currentTemplate;
  const tokens = template ? effectiveTokens(template, mode) : {};
  const resolver = (name: string) => tokens[name];
  const swatches = ['--background', '--card', '--foreground', '--accent', '--success', '--warning', '--destructive', '--info'];

  return (
    <div
      data-hudson-template={template?.id}
      data-hudson-theme={mode}
      style={styleFromTokens(tokens)}
      className="@container min-h-full overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-[var(--hud-shadow-panel)]"
    >
      <div
        className="relative min-h-full p-5"
        style={{
          backgroundColor: 'oklch(var(--background))',
          backgroundImage: [
            'radial-gradient(circle, var(--hud-canvas-dot-minor, oklch(var(--foreground) / 0.06)) 1px, transparent 1px)',
            'radial-gradient(circle, var(--hud-canvas-dot-major, oklch(var(--foreground) / 0.10)) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '20px 20px, 100px 100px',
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              <Grid3X3 size={12} /> {template?.id ?? 'template'} · {mode}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Canonical preview surface</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Chrome, content, focus, status, and type primitives all read from the same CSS custom properties that embeds receive through the template/theme attributes.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-border bg-card/80 p-2">
            {swatches.map(token => {
              const swatch = tokenSwatchValue(tokens[token] ?? '', resolver);
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => designer.setSelectedToken(token)}
                  title={token}
                  className="h-6 w-6 rounded border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ background: swatch ?? 'transparent' }}
                />
              );
            })}
          </div>
        </div>

        <div className={`grid gap-4 ${split ? 'grid-cols-1' : '@5xl:grid-cols-[1.2fr_0.8fr]'}`}>
          <section className="rounded-xl border border-border bg-card/90 p-4 shadow-[0_16px_60px_-44px_oklch(var(--foreground))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-card-foreground">Component primitives</h2>
                <p className="text-[12px] text-muted-foreground">Buttons, cards, badges, and status colors.</p>
              </div>
              <Badge>Badge</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <PreviewButton label="Primary" token="--primary" variant="primary" />
              <PreviewButton label="Secondary" token="--secondary" variant="secondary" />
              <PreviewButton label="Accent" token="--accent" variant="accent" />
              <PreviewButton label="Ghost" token="--muted" variant="ghost" />
              <PreviewButton label="Delete" token="--destructive" variant="destructive" />
            </div>

            <div className="mt-4 grid gap-3 @lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Card</div>
                <h3 className="mt-2 text-lg font-semibold text-foreground">Surface contrast</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Cards use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">--card</code>, borders use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">--border</code>.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/70 p-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Focus ring</div>
                <button className="mt-3 inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-2 ring-ring ring-offset-2 ring-offset-background">
                  <Focus size={14} /> Accent keyed focus
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill kind="success" label="ok" icon={CheckCircle2} token="--success" />
              <StatusPill kind="warning" label="warn" icon={AlertTriangle} token="--warning" />
              <StatusPill kind="destructive" label="error" icon={XCircle} token="--destructive" />
              <StatusPill kind="info" label="info" icon={Info} token="--info" />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card/90 p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <Type size={12} /> Type + code
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Heading one</h1>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Heading two</h2>
              <h3 className="text-xl font-medium text-foreground">Heading three</h3>
              <h4 className="text-base font-medium uppercase tracking-wider text-muted-foreground">Heading four</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Body text stays quiet and legible over the selected background. Use contrast readouts to confirm each pair before saving.
              </p>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground"><code>{`const theme = {
  template: '${template?.id ?? 'custom'}',
  theme: '${mode}',
  accent: 'oklch(var(--accent))',
};`}</code></pre>
          </section>
        </div>

        {!split && (
          <section className="mt-4 grid gap-3 @2xl:grid-cols-3">
            <ContrastPair label="foreground / background" fg="oklch(var(--foreground))" bg="oklch(var(--background))" />
            <ContrastPair label="accent foreground / accent" fg="oklch(var(--accent-foreground))" bg="oklch(var(--accent))" />
            <ContrastPair label="card foreground / card" fg="oklch(var(--card-foreground))" bg="oklch(var(--card))" />
          </section>
        )}
      </div>
    </div>
  );
}

export function ThemeDesignerContent() {
  const designer = useThemeDesigner();
  const [splitPreview, setSplitPreview] = useState(false);
  const modes = useMemo<ThemeMode[]>(() => splitPreview ? ['dark', 'light'] : [designer.selectedMode], [designer.selectedMode, splitPreview]);

  return (
    <div className="@container h-full overflow-y-auto bg-background p-4 text-foreground frame-scrollbar">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Theme Designer</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Live editing <span className="text-foreground">{designer.selectedTemplateId}</span> / <span className="text-foreground">{designer.selectedMode}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSplitPreview(value => !value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-foreground/80 transition hover:border-accent/60 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {splitPreview ? 'Single preview' : 'Dark / light preview'}
        </button>
      </div>

      <div className={splitPreview ? 'grid gap-4 @6xl:grid-cols-2' : 'grid gap-4'}>
        {modes.map(mode => <PrimitivePreview key={mode} mode={mode} split={splitPreview} />)}
      </div>
    </div>
  );
}
