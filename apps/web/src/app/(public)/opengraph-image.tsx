import { ImageResponse } from 'next/og';

export const alt = 'Docversity verification. Public verification is not available yet.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '64px 72px',
        background: '#03142f',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      <span style={{ fontSize: 28 }}>Docversity</span>
      <div
        style={{ display: 'flex', marginTop: 64, fontSize: 80, fontWeight: 700, letterSpacing: -3 }}
      >
        Verify. <span style={{ color: '#ffc928', marginLeft: 20 }}>Trust.</span>
        <span style={{ marginLeft: 20 }}>Confirm.</span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 52,
          fontSize: 24,
          color: '#bccce3',
          flexWrap: 'wrap',
        }}
      >
        <span>Result Checking</span>
        <span>Registration Verification</span>
        <span>Certificate Verification</span>
        <span>Admission Letter Verification</span>
      </div>
      <span style={{ marginTop: 36, fontSize: 22, color: '#ffc928' }}>
        Public verification is not available yet
      </span>
    </div>,
    size,
  );
}
