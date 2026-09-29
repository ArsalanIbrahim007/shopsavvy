import { tokenize } from "../../services/similarity.service.js";
import { modelTokens } from "../../services/normalizeTitle.service.js";

/**
 * A coarse product-family key: the first four model tokens of a title
 * ("samsung galaxy watch 8", "samsung galaxy a17").
 *
 * Used to keep pairs about the same product together when splitting the
 * dataset. Without it, three pairs about one watch can land on both sides of
 * the train/test split, and the test score partly measures memorisation of
 * that watch's title rather than generalisation.
 */
export function familyKey(title = "") {
  return tokenize(modelTokens(title)).slice(0, 4).join(" ");
}

/**
 * Groups labelled pairs into connected components: two pairs are in the same
 * group when they share a listing or a product family. Splitting whole
 * components guarantees no listing and no family appears on both sides of a
 * train/test (or train/validation) split. Returns [[root, pairs[]], ...].
 */
export function pairComponents(pairs) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  const union = (x, y) => parent.set(find(x), find(y));

  for (const pair of pairs) {
    const family = "family:" + (pair.family || familyKey(pair.titleA));
    union("listing:" + pair.idA, family);
    union("listing:" + pair.idB, family);
  }

  const groups = new Map();
  for (const pair of pairs) {
    const root = find("listing:" + pair.idA);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(pair);
  }
  return [...groups];
}
