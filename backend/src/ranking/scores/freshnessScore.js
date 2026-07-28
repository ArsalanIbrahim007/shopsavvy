export function calculateFreshnessScore(lastScrapedAt, weight = 20) {
  if (!lastScrapedAt) return Number((0.5 * weight).toFixed(2));

  const scrapedDate = new Date(lastScrapedAt);
  const now = new Date();

  const ageInHours = (now - scrapedDate) / (1000 * 60 * 60);

  let rawScore;

  if (ageInHours <= 24) rawScore = 1;
  else if (ageInHours <= 72) rawScore = 0.75;
  else if (ageInHours <= 168) rawScore = 0.5;
  else rawScore = 0.25;

  return Number((rawScore * weight).toFixed(2));
}