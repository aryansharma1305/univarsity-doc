import { ImageResponse } from 'next/og';

/** Share image for links to the public site (WhatsApp, email, social), generated at build time. */
export const alt = 'Docversity student portal. Everything academic. One intelligent workspace.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NAVY = '#03142F';
const BLUE = '#0759D7';
const ROWS = ['Profile details', 'Your registrations', 'Documents'] as const;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: NAVY,
        color: 'white',
        padding: '64px 72px',
        position: 'relative',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Soft blue light from the lower right */}
      <div
        style={{
          position: 'absolute',
          right: -160,
          bottom: -220,
          width: 760,
          height: 760,
          borderRadius: 9999,
          background: 'radial-gradient(circle, rgba(7,89,215,0.55), rgba(3,20,47,0) 70%)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', width: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 32 32">
            <path
              d="M16 2 4 6.5v8.7c0 7.4 5.1 12.7 12 14.8 6.9-2.1 12-7.4 12-14.8V6.5L16 2Z"
              fill="#071F4A"
              stroke="#D4AF7A"
              strokeWidth="1.2"
            />
            <path
              d="M11.5 10.5h4.2c3.4 0 5.8 2.2 5.8 5.5s-2.4 5.5-5.8 5.5h-4.2v-11Zm2.6 2.3v6.4h1.5c1.9 0 3.2-1.3 3.2-3.2s-1.3-3.2-3.2-3.2h-1.5Z"
              fill="#FFFFFF"
            />
          </svg>
          <span style={{ fontSize: 30, fontWeight: 700 }}>Docversity</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 72,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          <span>Everything academic.</span>
          <span style={{ color: '#8DB8FF' }}>One intelligent workspace.</span>
        </div>
        <span
          style={{ marginTop: 32, fontSize: 28, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}
        >
          Your profile, course, documents and examinations in one student portal.
        </span>
      </div>
      {/* Simplified portal card */}
      <div
        style={{
          position: 'absolute',
          right: 72,
          top: 120,
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: 22,
          borderRadius: 24,
          background: 'white',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          transform: 'rotate(-3deg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 18,
            borderRadius: 16,
            background: NAVY,
          }}
        >
          <span style={{ fontSize: 14, letterSpacing: 2, color: 'rgba(255,255,255,0.65)' }}>
            STUDENT OVERVIEW
          </span>
          <div
            style={{
              width: 190,
              height: 14,
              borderRadius: 99,
              background: 'rgba(255,255,255,0.85)',
            }}
          />
          <div
            style={{ width: 120, height: 9, borderRadius: 99, background: 'rgba(255,255,255,0.3)' }}
          />
        </div>
        {ROWS.map((row) => (
          <div
            key={row}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 16,
              borderRadius: 14,
              border: '1px solid #E2E8F0',
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{row}</span>
            <div style={{ width: 150, height: 8, borderRadius: 99, background: '#E2E8F0' }} />
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '8px 16px',
            borderRadius: 99,
            background: BLUE,
            color: 'white',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Student Sign In
        </div>
      </div>
    </div>,
    size,
  );
}
