export type AppCardData = {
  id: string;
  name: string;
  tag: string;
  lede: string;
  body: string;
  accent: string;
  icon?: string;
  source?: string;
  href?: string;
};

export function AppCard({ app, index }: { app: AppCardData; index: number }) {
  return (
    <div
      className="hud-card"
      style={{
        border: 'var(--stroke-w) solid var(--ink)',
        background: 'var(--paper)',
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'oklch(0.145 0 0)',
          borderRight: '1px solid var(--ink)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1.4px)',
            backgroundSize: '12px 12px',
          }}
        />
        {app.icon ? (
          // Plain <img>: the static export has no image optimizer, so
          // next/image's /_next/image URLs 404 in production.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.icon}
            alt={`${app.name} icon`}
            width={88}
            height={88}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: 22,
              boxShadow: '0 0 0 1px oklch(0.64 0 0 / 0.25)',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              fontFamily: 'var(--font-display)',
              fontSize: 64,
              color: app.accent,
              lineHeight: 1,
              fontStyle: 'italic',
            }}
          >
            {app.name[0]}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'oklch(0.64 0 0)',
          }}
        >
          {app.tag}
        </div>
      </div>

      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--ink-2)',
              letterSpacing: '0.2em',
            }}
          >
            0{index}
          </span>
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
            }}
          >
            {app.name}
          </h3>
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            lineHeight: 1.1,
            color: 'var(--ink)',
          }}
        >
          {app.lede}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55 }}>
          {app.body}
        </p>
        {(app.source || app.href) && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {app.source && (
              <a
                className="tag tag--accent"
                href={app.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                view source
              </a>
            )}
            <span style={{ flex: 1 }} />
            {app.href && (
              <a
                href={app.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--ink)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                ▸ open
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
