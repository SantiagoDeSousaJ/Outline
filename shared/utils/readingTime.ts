/**
 * Calculates the estimated reading time for a given text.
 *
 * @param text The plain text content to measure.
 * @returns The estimated reading time in minutes.
 */
export function calculateReadingTime(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const words = trimmed.split(/\s+/).filter((word) => word.length > 0).length;
  const wordsPerMinute = 200;

  return Math.ceil(words / wordsPerMinute);
}

