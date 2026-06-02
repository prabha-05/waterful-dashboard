// Shorten Shopify's long product titles to just the flavor name + the
// "Pack of N" suffix (if mentioned anywhere in the title). Anything inside or
// after the first parenthesis is treated as description bloat and dropped.
// If `maxLen` is provided and the cleaned result still exceeds it, the
// result is ellipsised so it fits in a compact UI slot.
export function shortenProductName(full: string, maxLen?: number): string {
  if (!full) return full;
  const packMatch = full.match(/pack of (\d+)/i);
  const packPart = packMatch ? ` — Pack of ${packMatch[1]}` : "";
  let name = full.split(/\s*\(/)[0].trim();
  // Strip trailing dashes / em-dashes that would dangle after truncation.
  name = name.replace(/[—–-]\s*$/, "").trim();
  const cleaned = name + packPart;
  if (maxLen && cleaned.length > maxLen) return cleaned.slice(0, maxLen) + "…";
  return cleaned;
}
