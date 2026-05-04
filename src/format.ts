export function formatContextLength(contextLength: number | null): string {
  if (!contextLength) return "N/A";

  if (contextLength >= 1_000_000) {
    const millions = contextLength / 1_000_000;
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}m`;
  }

  return `${Math.round(contextLength / 1000)}K`;
}
