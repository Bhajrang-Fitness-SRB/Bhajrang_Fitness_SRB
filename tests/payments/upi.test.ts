import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { upiLink, isValidVpa } from '../../src/lib/upi';

const VPA = 'BHARATPE.9E0Y0V1P7C053477@unitype';   // the gym's real BharatPe merchant ID, read from the printed QR

test('the printed BharatPe QR and the app use the same UPI ID', () => {
  const printed = 'upi://pay?pa=BHARATPE.9E0Y0V1P7C053477@unitype&pn=Verified Merchant&cu=INR&tn=Pay to BharatPe Merchant';
  assert.equal(new URL(printed).searchParams.get('pa'), VPA);
  assert.equal(new URL(upiLink(VPA, 'Bhajrang Fitness', 600, 'SRB1 Renewal')).searchParams.get('pa'), VPA);
});

test('link has the right fields and the amount has two decimals', () => {
  const u = new URL(upiLink(VPA, 'Bhajrang Fitness', 600, 'SRB92900086 Renewal - 1 Month'));
  assert.equal(u.searchParams.get('am'), '600.00');
  assert.equal(u.searchParams.get('cu'), 'INR');
  assert.equal(u.searchParams.get('pn'), 'Bhajrang Fitness');
});

test('no amount means an "any amount" link (am=0 is refused by UPI apps)', () => {
  assert.ok(!upiLink(VPA, 'Bhajrang Fitness', 0, 'x').includes('am='));
  assert.ok(!upiLink(VPA, 'Bhajrang Fitness', NaN, 'x').includes('am='));
});

test('odd characters in the note cannot break the link', () => {
  const l = upiLink(VPA, 'Bhajrang Fitness', 100, 'Ravi & Sons <b>₹?=\n' + 'x'.repeat(200));
  const u = new URL(l);
  assert.equal(u.searchParams.get('pa'), VPA);
  assert.ok((u.searchParams.get('tn') ?? '').length <= 50);
  assert.ok(!/[<>&=?]/.test(u.searchParams.get('tn') ?? ''));
});

test('UPI ID check accepts real IDs and rejects typos', () => {
  for (const ok of [VPA, 'gym@okaxis', 'name.surname-1@ybl']) assert.ok(isValidVpa(ok), ok);
  for (const bad of ['', 'gym', 'gym@', '@okaxis', 'gym @okaxis', 'gym@@ybl', 'g@y']) assert.ok(!isValidVpa(bad), bad);
});

test('the QR the app draws can be read back (white tile with a quiet border)', async () => {
  const link = upiLink(VPA, 'Bhajrang Fitness', 1700, 'SRB92900001 Renewal');
  const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, scale = 6, quiet = 4 * scale, pad = 14, side = n * scale + 2 * (quiet + pad);
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
    const i = ((quiet + pad + y * scale + dy) * side + quiet + pad + x * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
  }
  assert.equal(jsQR(px, side, side)?.data, link);
});
