// dropChance.js — the words for the drop forecast's note (components/product/DropChance.jsx), from the API's `dropChances`:
// [{platform, price, chance: {lift, chance, share}}] for the offers in the forecast's riskiest share.

const list = (names) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** {lead, caveat}, or null when no price is flagged. */
export function dropChanceText(chances, nameOf) {
  if (!Array.isArray(chances) || chances.length === 0) return null;
  const { lift, chance, share } = chances[0].chance ?? {};
  if (!(lift > 1) || !(chance > 0) || !(share > 0)) return null;
  const stores = [...new Set(chances.map((c) => nameOf(c.platform)))];
  const one = stores.length === 1;
  return {
    lead: `${list(stores)}'s ${one ? "price is" : "prices are"} among the ${Math.round(share * 100)}% our forecast ranks most likely to fall 3% or more within a week, from how ${one ? "it has" : "they have"} moved so far.`,
    caveat: `In our test, prices ranked like this dropped ${lift.toFixed(1)} times as often as others, yet only about 1 in ${Math.round(1 / chance)} did: a hint for whether to wait, not a promise.`,
  };
}
