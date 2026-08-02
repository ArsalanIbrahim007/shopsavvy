const PLATFORM_TRUST_SCORES = {
  "PriceOye": 0.95,
  "Mega.pk": 0.9,
  "Shophive": 0.88,
  "Telemart": 0.85,
  "HomeShopping": 0.82,
  "Paklap": 0.8,
  "CZone": 0.8,
  "Galaxy": 0.78,
  "VMart": 0.75,
};

export function calculateTrustScore(platform = "", weight = 20) {
  const trustValue = PLATFORM_TRUST_SCORES[platform] ?? 0.6;

  return Number((trustValue * weight).toFixed(2));
}