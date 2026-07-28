export function tokenize(text = "") {
  return text
    .toLowerCase()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function calculateJaccardSimilarity(textA = "", textB = "") {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  const intersection = new Set(
    [...tokensA].filter((token) => tokensB.has(token))
  );

  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

export function getSimilarityPercentage(textA = "", textB = "") {
  return Math.round(calculateJaccardSimilarity(textA, textB) * 100);
}

export function isSimilarProduct(textA = "", textB = "", threshold = 0.7) {
  return calculateJaccardSimilarity(textA, textB) >= threshold;
}