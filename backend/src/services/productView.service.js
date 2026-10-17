// productView.service.js — the product a listing belongs to, as the product page shows it.
//
// One place for "this listing and the same product at other stores", used by the product page (GET /api/listings/:id) and by the
// browser extension's lookup (GET /api/listings/match), so the two can never disagree about which offers are the same product.
// Nothing here scrapes: it reads what is stored.

import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { selectCandidates } from "./candidateSelection.service.js";
import { groupListings } from "./grouping.service.js";
import { attachPriceHistory } from "./historyEnrichment.service.js";
import { attachRecommendation, attachRecommendations } from "./recommendation/recommendation.service.js";

const idOf = (offer) => offer?._id?.toString();

/**
 * Groups `listing` with the stored listings of its category that could be the same product, the way search does, and returns its
 * group. `listing` need not be stored: the extension passes a page the database has never seen (an `_id` that is not a database id),
 * and the grouping then says which stored product, if any, that page is.
 *
 * @param {object} listing  a listing (plain object or document) with _id, title, price, platform and productCategory
 * @param {{strategy?: "ml"|"rule", cap?: number, load?: (filter: object) => Promise<object[]>}} [options]  `cap`: most candidates
 *   grouped (selectCandidates' default when omitted); `load` replaces the database read in tests
 * @returns {Promise<{selectedListing: object, selectedGroup: object|null, offers: object[]}>}
 */
export async function buildProductView(listing, { strategy = "ml", cap, load } = {}) {
  /*
   * Candidates for "the same product elsewhere": listings in the same
   * product category whose titles overlap this one, not every listing that
   * shares the coarse "Electronics" category. See selectCandidates.
   */
  const filter = {
    ...VISIBLE_PLATFORMS_FILTER,
    productCategory: listing.productCategory || "other",
    _id: { $ne: listing._id },
  };
  const categoryPool = load ? await load(filter) : await Listing.find(filter).sort({ price: 1 });

  const possibleMatches = selectCandidates(listing, categoryPool, cap ? { cap } : {});

  /*
   * Price history must be attached before grouping so the
   * fake-discount and deal-ranking engines can use it.
   */
  const enrichedMatches = await attachPriceHistory(possibleMatches);

  const recommendedGroups = await groupListings(enrichedMatches, { strategy });

  const selectedGroup =
    recommendedGroups.find((group) => (group.offers || []).some((offer) => idOf(offer) === idOf(listing))) || null;

  const offers = selectedGroup ? selectedGroup.offers : attachRecommendations(await attachPriceHistory([listing]));

  const selectedListing = offers.find((offer) => idOf(offer) === idOf(listing)) || attachRecommendation(listing);

  return { selectedListing, selectedGroup, offers };
}
