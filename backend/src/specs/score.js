// score.js — how good a product's specifications are for its category, 0 to 100, from what they ARE, not from how many are known.
//
// The first version gave each field its points when the field was present, so the score measured how complete a store's page was
// (a phone whose page listed NFC scored higher than a better phone whose page did not; review of 2026-10-22). Now each known value is
// placed on a scale for its category (8 GB of RAM is 0.7 of the way for a phone, 0.45 for a laptop; a laptop's weight counts the
// lighter the better), weighted, and the score is the weighted share over the fields that are KNOWN. A field a page does not state
// neither earns nor costs points, and the parts say which fields the score rests on, so the page can show "from 7 of 11".
// The scales are judgement, written down here so they can be argued with: entry phones of 2026 in Pakistan have 4 GB of RAM, 5000 mAh
// and a 50 MP camera; flagships 12 GB, a top chipset and 120 Hz.

/** Fewer known fields than this give no score: two or three values say too little to rank a phone by. A laptop's chip, RAM and
 * storage are most of what tells laptops apart, and most laptop pages state little else, so three do for a laptop. */
export const MIN_SCORED_FIELDS = 4;
const MIN_FIELDS_FOR = { laptop: 3 };

/** Linear between (value, share) points, clamped at both ends. */
const scale = (...points) => (value) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
};
const TIER = { entry: 0.25, mid: 0.5, "upper-mid": 0.75, flagship: 1 };
const tier = (value) => TIER[value] ?? null;
const PANEL = { AMOLED: 1, OLED: 1, IPS: 0.6, LCD: 0.45 };
const panel = (value) => PANEL[value] ?? null;
const flag = (value) => (value === true ? 1 : value === false ? 0 : null);

const PHONE = {
  chipsetTier: [25, tier],
  ramGb: [15, scale([3, 0.2], [4, 0.35], [6, 0.5], [8, 0.7], [12, 0.9], [16, 1])],
  storageGb: [10, scale([32, 0.15], [64, 0.3], [128, 0.55], [256, 0.8], [512, 1])],
  batteryMah: [15, scale([3000, 0.2], [4000, 0.45], [5000, 0.75], [6000, 0.95], [7000, 1])],
  refreshHz: [8, scale([60, 0.3], [90, 0.6], [120, 0.9], [144, 1])],
  displayType: [7, panel],
  mainCameraMp: [8, scale([8, 0.2], [13, 0.4], [50, 0.75], [108, 0.9], [200, 1])],
  frontCameraMp: [4, scale([5, 0.2], [8, 0.4], [16, 0.7], [32, 1])],
  chargingW: [5, scale([10, 0.2], [18, 0.4], [33, 0.6], [67, 0.85], [120, 1])],
  has5g: [2, flag],
  nfc: [1, flag],
};

const SCALES = {
  smartphone: PHONE,
  tablet: { ...PHONE, batteryMah: [15, scale([5000, 0.3], [8000, 0.7], [10000, 1])], mainCameraMp: [4, PHONE.mainCameraMp[1]] },
  laptop: {
    chipsetTier: [30, tier],
    ramGb: [25, scale([4, 0.2], [8, 0.45], [16, 0.75], [32, 1])],
    storageGb: [20, scale([128, 0.2], [256, 0.45], [512, 0.75], [1024, 1])],
    refreshHz: [5, scale([60, 0.4], [120, 0.8], [144, 1])],
    displayType: [5, panel],
    weightG: [10, scale([1000, 1], [1500, 0.8], [2000, 0.55], [2500, 0.3], [3000, 0.15])],
  },
};

/**
 * @param {Record<string, any>} sheet  a canonical sheet (normalize.js)
 * @param {string} category
 * @returns {{ score: number, parts: Array<{ field: string, points: number, max: number }> } | null}  parts are the known fields only
 */
export function specScore(sheet, category) {
  const scales = SCALES[category];
  if (!scales || !sheet) return null;
  const parts = [];
  for (const [field, [weight, share]] of Object.entries(scales)) {
    const value = share(sheet[field]);
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    parts.push({ field, points: Math.round(weight * value * 10) / 10, max: weight });
  }
  if (parts.length < (MIN_FIELDS_FOR[category] ?? MIN_SCORED_FIELDS)) return null;
  const earned = parts.reduce((sum, p) => sum + p.points, 0);
  const possible = parts.reduce((sum, p) => sum + p.max, 0);
  return { score: Math.round((earned / possible) * 100), parts };
}
