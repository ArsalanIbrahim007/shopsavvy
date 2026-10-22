/** Minimum number of fields required to produce a score (avoids scoring a single-field sheet as 0%). */
const MIN_FIELDS = 2;

/** Max points per field per category. Total per category must sum to 100. */
const WEIGHTS = {
  smartphone: {
    chipset: 10, chipsetTier: 5, ramGb: 15, storageGb: 10,
    displayInches: 5, refreshHz: 5, displayType: 5,
    batteryMah: 15, chargingW: 5, mainCameraMp: 10, frontCameraMp: 5,
    os: 5, has5g: 3, nfc: 2,
  },
  tablet: {
    chipset: 10, ramGb: 15, storageGb: 10, displayInches: 10,
    refreshHz: 5, displayType: 5, batteryMah: 20, chargingW: 5,
    mainCameraMp: 5, frontCameraMp: 5, os: 5, has5g: 3, nfc: 2,
  },
  laptop: {
    chipset: 15, chipsetTier: 5, ramGb: 20, storageGb: 15,
    displayInches: 10, refreshHz: 5, displayType: 5, batteryMah: 10,
    chargingW: 5, os: 5, weightG: 5,
  },
};

const DEFAULT_WEIGHTS = {
  chipset: 15, ramGb: 15, storageGb: 15, batteryMah: 15,
  displayInches: 10, mainCameraMp: 10, os: 10,
  has5g: 5, nfc: 5,
};

/**
 * @param {Record<string, any>} sheet  — normalized (typed) spec sheet
 * @param {string} category
 * @returns {{ score: number, parts: Array<{ field: string, points: number, max: number }> } | null}
 */
export function specScore(sheet, category) {
  const presentFields = Object.keys(sheet).filter((k) => sheet[k] !== undefined && sheet[k] !== null);
  if (presentFields.length < MIN_FIELDS) return null;

  const weights = WEIGHTS[category] ?? DEFAULT_WEIGHTS;
  const parts = [];
  let earned = 0;
  let possible = 0;

  for (const [field, max] of Object.entries(weights)) {
    const present = field in sheet && sheet[field] !== null && sheet[field] !== undefined;
    const points = present ? max : 0;
    parts.push({ field, points, max });
    earned += points;
    possible += max;
  }

  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  return { score, parts };
}