export type PlatformKind = 'ios' | 'macos' | 'web';

export type PlatformFrameProps = {
  kind: PlatformKind;
  label: string;
  sub: string;
};

export function PlatformFrame({ kind, label, sub }: PlatformFrameProps) {
  const isMobile = kind === 'ios';
  const W = isMobile ? 132 : 220;
  const H = isMobile ? 200 : 156;
  const radius = kind === 'ios' ? 18 : kind === 'macos' ? 6 : 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: W,
          height: H,
          background: 'oklch(0.145 0 0)',
          border: '1px solid var(--line)',
          borderRadius: radius,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 4px 0 var(--paper-edge)',
        }}
      >
        {kind === 'macos' && (
          <div style={{ position: 'absolute', top: 6, left: 8, display: 'flex', gap: 5 }}>
            {['oklch(0.65 0.2 30)', 'oklch(0.78 0.16 80)', 'oklch(0.7 0.17 145)'].map((c, i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            ))}
          </div>
        )}
        {kind === 'ios' && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 50,
              height: 12,
              background: 'oklch(0.05 0 0)',
              borderRadius: 6,
            }}
          />
        )}
        {kind === 'web' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 18,
              background: 'oklch(0.20 0 0)',
              borderBottom: '1px solid oklch(0.30 0 0)',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
              gap: 6,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.4 0 0)' }}
              />
            ))}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: kind === 'ios' ? 24 : 22,
            left: 0,
            right: 0,
            height: kind === 'ios' ? 22 : 14,
            background: 'oklch(0.18 0 0)',
            borderBottom: '1px solid var(--accent-line)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
            gap: 4,
          }}
        >
          <div
            style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 2 }}
          />
          <div style={{ width: 24, height: 4, background: 'oklch(0.4 0 0)' }} />
          <div style={{ width: 18, height: 4, background: 'oklch(0.4 0 0)' }} />
        </div>

        <div
          style={{
            position: 'absolute',
            left: 0,
            top: kind === 'ios' ? 46 : 36,
            bottom: 14,
            width: kind === 'ios' ? 28 : 44,
            background: 'oklch(0.18 0 0)',
            borderRight: '1px solid oklch(0.30 0 0)',
          }}
        />
        {kind !== 'ios' && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 36,
              bottom: 14,
              width: 44,
              background: 'oklch(0.18 0 0)',
              borderLeft: '1px solid oklch(0.30 0 0)',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: kind === 'ios' ? 28 : 44,
            right: kind === 'ios' ? 0 : 44,
            top: kind === 'ios' ? 46 : 36,
            bottom: 14,
            background: 'oklch(0.145 0 0)',
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1.4px)',
            backgroundSize: '12px 12px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '60%',
              height: '40%',
              border: '1px solid var(--accent-line)',
              background: 'var(--accent-soft)',
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 14,
            background: 'oklch(0.18 0 0)',
            borderTop: '1px solid oklch(0.30 0 0)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
          }}
        >
          <div
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.7 0.17 145)' }}
          />
          <div style={{ width: 30, height: 3, background: 'oklch(0.4 0 0)', marginLeft: 6 }} />
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}
      >
        <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{label}</div>
        <div
          style={{
            color: 'var(--ink-2)',
            fontSize: 9.5,
            marginTop: 4,
            letterSpacing: '0.12em',
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}
