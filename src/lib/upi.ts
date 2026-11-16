/** UPI payment links. Format follows the NPCI UPI link specification (the same one the printed BharatPe QR uses). */
export const VPA_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}@[a-zA-Z][a-zA-Z0-9]{1,31}$/;
export const isValidVpa = (v: string): boolean => VPA_PATTERN.test(v.trim());

export function upiLink(vpa: string, name: string, amount: number, note: string): string {
  const parts = [`pa=${vpa.trim()}`, `pn=${encodeURIComponent(name.trim().slice(0, 60))}`];
  // Only fix an amount when there is one: an "am=0" link is refused by several UPI apps.
  if (Number.isFinite(amount) && amount > 0) parts.push(`am=${amount.toFixed(2)}`);
  parts.push('cu=INR');
  const tn = note.replace(/[^\w .,#/-]/g, ' ').trim().slice(0, 50);   // plain characters only, short, like banks expect
  if (tn) parts.push(`tn=${encodeURIComponent(tn)}`);
  return `upi://pay?${parts.join('&')}`;
}
