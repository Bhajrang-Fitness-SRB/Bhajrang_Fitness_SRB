// A QR made the way the gym screen makes it must be readable by the member scanner, and the scanner must pull out the right code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { pickToken } from '../../src/lib/gateToken';

function decode(url: string, scale: number, quiet = 4): string | null {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, size = (n + quiet * 2) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) {
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  }
  return jsQR(px, size, size)?.data ?? null;
}

test('QR made for the gym screen decodes and yields the code', () => {
  const token = 'a3f09c71be';
  const url = `https://bhajrang-fitness-srb.onrender.com/warrior?g=${token}`;
  for (const scale of [3, 4, 6, 10]) { const got = decode(url, scale); assert.equal(got, url, `scale ${scale}`); assert.equal(pickToken(got!), token); }
});
test('pickToken accepts links and a bare code, refuses everything else', () => {
  assert.equal(pickToken('https://x.com/warrior?g=0123456789'), '0123456789');
  assert.equal(pickToken('https://x.com/warrior?a=1&g=ABCDEF0123'), 'abcdef0123');
  assert.equal(pickToken('  0123456789  '), '0123456789');
  for (const bad of ['', 'hello', 'https://x.com/warrior', 'https://x.com/?g=short', 'https://x.com/?g=0123456789abc', 'https://x.com/?g=zzzzzzzzzz', 'g=0123456789 ; drop']) assert.equal(pickToken(bad), bad === 'g=0123456789 ; drop' ? null : null, bad);
});
