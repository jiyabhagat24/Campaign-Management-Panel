// Indian-numbering-system compact currency formatter — Lakh (1,00,000) up to
// just under a Crore, then Crore (1,00,00,000) beyond that. Used anywhere a
// rupee value gets compacted for display (dashboard summary cards, pipeline
// budget column) so a value like ₹9,89,42,091 shows as "₹9.89Cr" instead of
// an unreadable "₹9894.2L".
export function formatCompactINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
