// Manually-set daily budgets per campaign. Used by both the Trends API
// (for alerts) and the Trends UI (for card colors / captions).
// Match is case-insensitive substring on campaign name; first hit wins.
// Update these numbers when budgets change for the month.
export const TARGET_DAILY_BUDGETS: { pattern: string; daily: number }[] = [
  { pattern: "broad creative testing", daily: 18216 },
  { pattern: "adv+ scaling", daily: 8155 },
];

export function targetDailyBudget(campaignName: string, fallback: number | null = null): number | null {
  const lower = campaignName.toLowerCase();
  for (const b of TARGET_DAILY_BUDGETS) {
    if (lower.includes(b.pattern)) return b.daily;
  }
  return fallback;
}
