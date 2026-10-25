// Reads the gym QR code. The QR holds a link like https://yourapp.com/warrior?g=0123456789 (10 hex characters).
export const pickToken = (text: string): string | null => {
  const m = text.match(/[?&]g=([0-9a-f]{10})\b/i);
  if (m) return m[1].toLowerCase();
  return /^[0-9a-f]{10}$/i.test(text.trim()) ? text.trim().toLowerCase() : null;
};
