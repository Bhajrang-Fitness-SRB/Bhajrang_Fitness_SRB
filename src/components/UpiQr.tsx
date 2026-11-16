import { QRCodeSVG } from 'qrcode.react';
import { upiLink } from '../lib/upi';

/**
 * Payment QR that phones can actually scan: black code on a white tile with a quiet border
 * (a QR on a dark card with no white border does not scan), medium error correction, UPI ID shown underneath,
 * and a button that opens the UPI app directly when the screen is on a phone.
 */
export function UpiQr({ vpa, amount, note, size = 190, name = 'Bhajrang Fitness' }: { vpa: string; amount: number; note: string; size?: number; name?: string }) {
  const link = upiLink(vpa, name, amount, note);
  return <div style={{ display: 'inline-block', textAlign: 'center' }}>
    <div style={{ background: '#ffffff', padding: 14, borderRadius: 12, display: 'inline-block', lineHeight: 0 }}>
      <QRCodeSVG value={link} size={size} level="M" marginSize={0} bgColor="#ffffff" fgColor="#000000" />
    </div>
    <div style={{ fontSize: 12, marginTop: 8, wordBreak: 'break-all' }}>{vpa}</div>
    <a href={link} className="button ghost" style={{ marginTop: 8, display: 'inline-block', fontSize: 12 }}>Open in UPI app</a>
  </div>;
}
