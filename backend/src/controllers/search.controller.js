// search.controller.js — GET /api/listings/search and /suggest: the search box.
//
// A search reads what is stored first and decides from its own results whether to ask the stores (searchFreshness.js), then
// groups the listings into products (in a worker for large sets, grouping.service.js) and ranks them.

import { AppError } from "../errors/AppError.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { detectQueryCategory } from "../scrapers/productCategory.js";
import { hasAdminKey } from "../middleware/adminKey.middleware.js";
import { groupListings } from "../services/grouping.service.js";
import { attachPriceHistory } from "../services/historyEnrichment.service.js";
import { extractModelCodes, extractScreenInches, normalizeTitle } from "../services/normalizeTitle.service.js";
import { prefixedModelCodes } from "../services/similarity.service.js";
import { extractBrand } from "../services/productAttributes.service.js";
import { currentOffers } from "../services/offerFreshness.service.js";
import { lowestBadge } from "../services/priceOutlook.service.js";
import { textParam, numberParam } from "../services/queryParams.service.js";
import { searchableText } from "../services/coreTitle.service.js";
import { attachRecommendation } from "../services/recommendation/recommendation.service.js";
import { fetchAndRefreshListings } from "../services/scraper.service.js";
import { resultsState } from "../services/searchFreshness.js";
import { buildWholeWordPattern, fuzzyMatchIds, joinedWordPattern, modelNumberWords, searchWordPattern, sizedModelCode, splitCategoryWords } from "../services/searchMatching.service.js";
import { groupRelevance, isSearchable, namesSearch, selectSearchListings, storeCount, worthAskingStores } from "../services/searchRanking.service.js";
import { getSuggestions } from "../services/suggestions.service.js";
import { priceStats } from "./priceStats.js";
import { resolveMatchStrategy } from "./matchStrategy.js";

// Longest search text accepted. Real product searches are a handful of words;
// anything longer is a paste or an attack, and it would only be fed to
// regex-building and scraping.
const MAX_QUERY_LENGTH = 100;
const MAX_PASTED_TITLE = 300; // as the extension's lookup (productMatch LIMITS.title)
const RELATED_LIMIT = 120; // other models of the searched line, shown after it

/**
 * Creates a flat listing array from the recommended grouped offers.
 * This keeps the existing "data" field available in the search response.
 */
function createRecommendedListingArray(listings = [], groups = []) {
  const recommendedOffersById = new Map();

  groups.forEach((group) => {
    (group.offers || []).forEach((offer) => {
      if (offer?._id) {
        recommendedOffersById.set(
          offer._id.toString(),
          offer
        );
      }
    });
  });

  return listings.map((listing) => {
    const listingId = listing?._id?.toString();

    return (
      recommendedOffersById.get(listingId) ||
      attachRecommendation(listing)
    );
  });
}

/** Search-box suggestions from the listings we hold. Under two characters answers an empty list. */
export async function suggestListings(req, res) {
  const q = textParam(req.query.q) ?? "";
  if (q.length > MAX_QUERY_LENGTH) {
    throw AppError.badRequest(`Search query is too long (maximum ${MAX_QUERY_LENGTH} characters).`);
  }

  const limit = Math.min(Math.floor(numberParam(req.query.limit) ?? 8), 15);
  const data = await getSuggestions(q, { limit });

  res.set("Cache-Control", "public, max-age=30");
  res.json({ success: true, count: data.length, data });
}

/**
 * The stored listings for a search, cheapest first, and how they were found: "exact" (the phrase, as whole words) and "words"
 * (every word, in any order), together; else "spelling" (every word nearly right: a typo), only when those found nothing.
 * @returns {Promise<{listings: object[], matchedBy: "exact"|"words"|"spelling"|null}>}
 */
export async function findSearchListings(trimmedQuery, searchFilter) {
  let listings = await Listing.find(searchFilter).sort({
    price: 1,
    createdAt: -1,
  });
  let matchedBy = listings.length ? "exact" : null;

  /*
   * The exact match found nothing -- try progressively looser strategies
   * before giving up, rather than showing an empty result for something
   * a real shopper would consider a reasonable typo. Each only runs if
   * the one before it found nothing, and both still respect the category
   * and attribute filters above so a fuzzy match can't leak results from
   * an unrelated product category.
   */
  /*
   * A typo'd query usually can't be classified (detectQueryCategory has
   * nothing exact to match), so no category filter makes it into
   * searchFilter above -- intentionally, since the same "no filter"
   * behaviour is what lets a genuine multi-category brand search like
   * "apple" or "samsung" return everything that brand makes (see
   * MULTI_CATEGORY_BRANDS in productCategory.js). But once we're already
   * in a fallback -- the strict match found nothing, so we're guessing --
   * that permissiveness works against us: "accessory" and "other" junk
   * (cases, chargers, holders, and miscategorized odds and ends) share
   * enough incidental text with the real product to fuzzy-match it, and
   * outrank it since there's nothing to tell them apart otherwise. A
   * misspelled main-product search is far more likely to mean the
   * product than an accessory for it or something uncategorized.
   */
  // Accessories only: "other" was left out too, and so were 111 stored JBL speakers and every product without a category of its
  // own, which no search but the exact phrase could then find ("jbl speaker" found nothing, 2026-11-07). Now that every word of a
  // search must match, uncategorised products are no longer the junk they were.
  const fallbackCategoryFloor = searchFilter.productCategory
    ? {}
    : { productCategory: { $ne: "accessory" } };

  // Every word, in any order, is asked even when the phrase found something: "samsung s25 ultra" found only cases and screen
  // protectors that say it word for word, while the phones say "Samsung Galaxy S25 Ultra" (2026-11-07). Both are kept.
  // A category word ("phone", "fridge", "ac") sets the category and is not looked for in titles (searchMatching.service.js).
  // A maker's series letters hyphenated to a model code ("KDL-32R300") are not looked for on their own: stores write the Sony
  // "32R300E" without them (audit re-test, 2026-11-19: "Sony KDL-32R300" found nothing, two stored).
  const codePrefixes = new Set([...trimmedQuery.toLowerCase().matchAll(/(?<![a-z0-9])([a-z]{2,4})-(?=\d)/g)].map((m) => m[1]));
  // A model's one-digit number stays with its word ("GT 5", "Fit 4": modelNumberWords); other one-character words are dropped.
  const allTokens = modelNumberWords(trimmedQuery.split(/[^a-zA-Z0-9]+/).filter(Boolean), (word) => extractBrand(word) !== null);
  const withoutPrefixes = allTokens.filter((t) => !codePrefixes.has(t.toLowerCase()));
  const { words: queryTokens, category: namedCategory } = splitCategoryWords(withoutPrefixes.length ? withoutPrefixes : allTokens);
  const categoryFloor = namedCategory && !searchFilter.productCategory ? { productCategory: namedCategory } : fallbackCategoryFloor;
  if (queryTokens.length > 0) {
    const tokenFilter = {
      ...searchFilter,
      ...categoryFloor,
      // Whole words, a plural allowed: "tea" matched inside "steamer", "steam iron" and "teal" (464 of the 500 shown, 2026-11-07).
      // A sized model code also matches its other spellings ("55U8000F", "U8000F", "UA55U8000FUSMM"; searchWordPattern).
      $and: queryTokens.map((token) => ({ title: { $regex: searchWordPattern(token), $options: "i" } })),
    };
    delete tokenFilter.$or;

    // ...and a title that states another screen size is another TV ("Samsung 43" Crystal UHD (U8000F)" for "55U8000F").
    const sizes = queryTokens.map(sizedModelCode).filter(Boolean).map((s) => s.size);
    const sameSize = (listing) => sizes.length === 0 || [null, ...sizes].includes(extractScreenInches(listing.title ?? "") === null ? null : Math.round(extractScreenInches(listing.title)));
    const byWords = (await Listing.find(tokenFilter).sort({ price: 1, createdAt: -1 })).filter(sameSize);
    const seen = new Set(listings.map((listing) => String(listing._id)));
    const added = byWords.filter((listing) => !seen.has(String(listing._id)));
    if (added.length) {
      listings = [...listings, ...added].sort((a, b) => a.price - b.price);
      matchedBy ??= "words";
    }

    // A maker's own store leaves its name out ("Airbud 550 Slide Earbuds" at audionic.co and Shophive, "TRANCE Airbud 815 with ANC"
    // at AlfaMall), so "Audionic Airbud 550" never found them and they showed as other products (2026-11-24). A search that starts
    // with a brand also takes the titles with every OTHER word that name no brand, or the same one ("ZERO TRANCE AIRBUD 850" is
    // Zero's, and stays out). Only with a model number left, never a brand and one loose word.
    const searchedBrand = extractBrand(queryTokens[0] ?? "");
    const rest = queryTokens.slice(1);
    // A real model number left (three digits or a code like "R50i"): "cmf watch pro 2" took in a brand-less "Gen 9 Pro 2 Ladies Smart
    // Watch", a clone, on "watch" and "pro 2" alone (audit 2026-11-26).
    if (searchedBrand && rest.length >= 2 && rest.some((token) => /\d{3,}|[a-z]\d|\d[a-z]/i.test(token))) {
      const brandlessFilter = { ...tokenFilter, $and: rest.map((token) => ({ title: { $regex: searchWordPattern(token), $options: "i" } })) };
      const brandless = (await Listing.find(brandlessFilter).sort({ price: 1, createdAt: -1 }))
        .filter(sameSize)
        .filter((listing) => [null, searchedBrand].includes(extractBrand(listing.title ?? "", listing.brand)));
      const have = new Set(listings.map((listing) => String(listing._id)));
      const more = brandless.filter((listing) => !have.has(String(listing._id)));
      if (more.length) {
        listings = [...listings, ...more].sort((a, b) => a.price - b.price);
        matchedBy ??= "words";
      }
    }
  }

  // Other models of the same line, after the one searched for (2026-11-26: "gt 5" showed only the GT 5, and a shopper wants the GT 4,
  // 6 and 7 too, below it). The search again without its model numbers ("huawei gt 5 pro" -> "huawei gt pro"), in the categories the
  // model itself was found in, at most RELATED_LIMIT listings; groupRelevance ranks them below the model, and the results page puts
  // them under "Other models". Not when the words left are only a brand ("samsung"), nor when the model was not found.
  let relatedIds = null;
  if (listings.length > 0 && queryTokens.some((token) => /\d/.test(token))) {
    const looseTokens = queryTokens.map((token) => token.replace(/\s+\d{1,4}$/, "")).filter((token) => !/^\d+$/.test(token) && !sizedModelCode(token) && !/\d/.test(token));
    const meaningful = looseTokens.filter((token) => extractBrand(token) === null);
    const categories = [...new Set(listings.map((listing) => listing.productCategory).filter((c) => c && c !== "other" && c !== "accessory"))];
    if (meaningful.length >= 1 && categories.length) {
      const relatedFilter = {
        ...searchFilter,
        productCategory: { $in: categories },
        $and: looseTokens.map((token) => ({ title: { $regex: searchWordPattern(token), $options: "i" } })),
      };
      delete relatedFilter.$or;
      const have = new Set(listings.map((listing) => String(listing._id)));
      const related = (await Listing.find(relatedFilter).sort({ price: 1, createdAt: -1 }))
        .filter((listing) => !have.has(String(listing._id)))
        .slice(0, RELATED_LIMIT);
      if (related.length) {
        // one whose own title names the model searched for is the model, not another one (a title the word search missed)
        const isModel = (listing) => namesSearch({ offers: [{ title: listing.title }] }, trimmedQuery);
        relatedIds = new Set(related.filter((listing) => !isModel(listing)).map((listing) => String(listing._id)));
        listings = [...listings, ...related].sort((a, b) => a.price - b.price);
      }
    }
  }

  // Joined words: a word may also be split by a space or hyphen anywhere in a title ("galaxytab a9" -> "Galaxy Tab A9").
  if (listings.length === 0 && queryTokens.length > 0) {
    const joinedFilter = { ...searchFilter, ...categoryFloor, $and: queryTokens.map((token) => ({ title: { $regex: joinedWordPattern(token), $options: "i" } })) };
    delete joinedFilter.$or;
    listings = await Listing.find(joinedFilter).sort({ price: 1, createdAt: -1 });
    if (listings.length) matchedBy = "words";
  }

  // A brand joined to a number ("haier398"): also the two words apart, each whole ("Haier … HRF-398"). Only a word of four letters
  // or more before the digits, so "iphone17" style codes, which match above, and short codes are not split.
  const splitTokens = queryTokens.flatMap((token) => (/^[a-z]{4,}\d{2,}$/i.test(token) ? token.match(/^([a-z]+)(\d+)$/i).slice(1) : [token]));
  if (listings.length === 0 && splitTokens.length > queryTokens.length) {
    const splitFilter = { ...searchFilter, ...categoryFloor, $and: splitTokens.map((token) => ({ title: { $regex: searchWordPattern(token), $options: "i" } })) };
    delete splitFilter.$or;
    listings = await Listing.find(splitFilter).sort({ price: 1, createdAt: -1 });
    if (listings.length) matchedBy = "words";
  }

  // Fewer words (2026-11-24): a store's whole title pasted in ("Audionic Airbud 550 Quad MIC ENC Earbuds, Gaming Mode, IPx4 ...") or a
  // word with junk on it ("Audionic Airbud 550sdasdasd") found nothing, because every word must match and the extra ones are in no
  // title. Junk glued to a number is cut off ("550sdasdasd" -> "550"); then, as titles start with the product, the most leading
  // words that some title has are kept: the listings with the first two words are fetched once, and those matching the longest
  // run of leading words shown. At least two words are kept (the brand and model, never one loose word). The page says which
  // words were searched (`searchedFor`).
  let searchedFor = null;

  // A model code in a pasted title, before its leading words (2026-11-26): Daraz's "Dawlance Top Load Fully Automatic Washing Machine
  // / DWT 955-C/ 12 Years Brand Warranty Included" was searched as "Dawlance Top Load Fully Automatic DWT", 54 products, without the
  // one part that names the machine, which DigiMall sells as "… Washing Machine DWT 955-C". The maker's code, written any way
  // ("DWT 955-C", "DWT-955C", "DWT955"; similarity.service.js prefixedModelCodes) or a code like "65C6K", with the brand the text
  // names; the page says what was searched for.
  if (listings.length === 0 && queryTokens.length > 2) {
    const brandWord = queryTokens.find((token) => extractBrand(token) !== null) ?? null;
    const brandMatch = brandWord ? [{ title: { $regex: searchWordPattern(brandWord), $options: "i" } }] : [];
    const tries = [
      ...[...prefixedModelCodes(trimmedQuery).keys()].map((base) => {
        const [, letters, number] = base.match(/^([a-z]+)(\d+)$/);
        return `(?<![A-Za-z0-9])${letters}[\\s-]?${number}(?![0-9])`;
      }),
      ...[...extractModelCodes(trimmedQuery, { minCodeLength: 4 })]
        .filter((code) => /[a-z]/.test(code) && /\d/.test(code) && !/^\d+[a-z]{1,4}$/.test(code))
        .map((code) => searchWordPattern(code)),
    ];
    for (const pattern of tries) {
      const codeFilter = { ...searchFilter, ...categoryFloor, $and: [{ title: { $regex: pattern, $options: "i" } }, ...brandMatch] };
      delete codeFilter.$or;
      const byCode = await Listing.find(codeFilter).sort({ price: 1, createdAt: -1 });
      if (byCode.length) {
        listings = byCode;
        matchedBy = "fewer_words";
        const written = trimmedQuery.match(new RegExp(pattern.replace(/\(\?!\[0-9\]\)$/, "(?:[\\s-]?[A-Za-z]{1,3}\\b)?"), "i"))?.[0] ?? "";
        searchedFor = [brandWord, written.trim()].filter(Boolean).join(" ");
        break;
      }
    }
  }

  const cleanTokens = queryTokens.map((token) => token.replace(/^(\d{2,})[a-z]{4,}$/i, "$1"));
  const cleaned = cleanTokens.some((token, i) => token !== queryTokens[i]);
  if (listings.length === 0 && cleanTokens.length >= 2 && (cleanTokens.length > 2 || cleaned)) {
    const patterns = cleanTokens.map((token) => new RegExp(searchWordPattern(token), "i"));
    const fewerFilter = { ...searchFilter, ...categoryFloor, $and: cleanTokens.slice(0, 2).map((token) => ({ title: { $regex: searchWordPattern(token), $options: "i" } })) };
    delete fewerFilter.$or;
    const candidates = await Listing.find(fewerFilter).sort({ price: 1, createdAt: -1 });
    const leadingWords = (listing) => {
      let count = 0;
      while (count < patterns.length && patterns[count].test(listing.title ?? "")) count += 1;
      return count;
    };
    const scored = candidates.map((listing) => ({ listing, words: leadingWords(listing) }));
    const best = Math.max(0, ...scored.map((s) => s.words));
    if (best >= 2) {
      listings = scored.filter((s) => s.words === best).map((s) => s.listing);
      matchedBy = "fewer_words";
      searchedFor = cleanTokens.slice(0, best).join(" ");
    }
  }

  if (listings.length === 0) {
    const { $or, ...attributeFilters } = searchFilter;
    Object.assign(attributeFilters, categoryFloor);

    const candidates = await Listing.find(attributeFilters, { title: 1 }).lean();
    const fuzzyIds = fuzzyMatchIds(queryTokens.join(" ") || trimmedQuery, candidates);

    if (fuzzyIds.length > 0) {
      listings = await Listing.find({ _id: { $in: fuzzyIds } }).sort({ price: 1, createdAt: -1 });
      if (listings.length) matchedBy = "spelling";
    }
  }

  return { listings, matchedBy, searchedFor, relatedIds };
}

export async function searchListings(req, res) {
  const q = textParam(req.query.q);

  if (!q) {
    throw AppError.badRequest("Search query is required. Example: /api/listings/search?q=iphone");
  }

  // A pasted marketplace title ("Tecno Spark Go 3 - 6.75 Inches Display - 4GB RAM ... - 5000mAh Battery") is searched by the
  // product it names (coreTitle.service.js), not refused for its length (2026-11-10). Beyond a title's length it is not a search.
  if (q.length > MAX_PASTED_TITLE) {
    throw AppError.badRequest(`Search query is too long (maximum ${MAX_PASTED_TITLE} characters).`);
  }
  const trimmedQuery = searchableText(q, MAX_QUERY_LENGTH);

  // "a", "1" or "?+" names nothing: it matched most of the catalogue (16,600 listings for "a") and ran into the worker's time
  // limit, and one that matched nothing would have sent every store a search for it.
  if (!isSearchable(trimmedQuery)) {
    // Urdu or another script (audit 2026-11-18: "آئی فون" was told to type letters): the stores name their products in English.
    if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(q)) {
      throw AppError.badRequest("The stores name their products in English, so please type the name in English, for example \"iPhone 16\" or \"Samsung TV\".");
    }
    throw AppError.badRequest("Type at least two letters or digits to search.");
  }

  const normalizedQuery = normalizeTitle(trimmedQuery);

/*
   * The scrape-time category filter only governs what is written. Listings
   * collected before that filter existed are still stored, so the category
   * constraint is applied again here at query time. Without this, a search
   * for "laptop" returns bags and batteries saved by earlier runs.
   */
  /*
   * The category may be supplied explicitly by the caller, which the homepage
   * carousels use to request only phones or only laptops. When it is not
   * supplied it is inferred from the query text.
   */
  const requestedCategory = textParam(req.query.category);
  const queryCategory = requestedCategory || detectQueryCategory(trimmedQuery).category;

  /*
   * The raw query can contain regex metacharacters ("iPhone (17)", "9+"),
   * which would either throw or match something unintended if passed
   * straight into $regex, so it is escaped before use.
   * buildSpaceTolerantPattern also escapes, and additionally lets a
   * missing space at a letter/digit boundary match either way, so
   * "iphone17" still finds "iPhone 17" and vice versa.
   *
   * normalizeTitle strips whole words it considers noise (brand names such
   * as "apple", compliance/marketing terms). A query consisting only of
   * such words -- "apple" is itself one -- normalises to an empty string,
   * and an empty pattern matches every document. That clause is therefore
   * only added once there is still something left to match on.
   */
  const searchFilter = {
    ...VISIBLE_PLATFORMS_FILTER,
    $or: [
      { title: { $regex: buildWholeWordPattern(trimmedQuery), $options: "i" } },
      ...(normalizedQuery
        ? [{ normalizedTitle: { $regex: buildWholeWordPattern(normalizedQuery), $options: "i" } }]
        : []),
    ],
  };

  if (queryCategory !== "other" && queryCategory !== "accessory") {
    searchFilter.productCategory = queryCategory;
  }

  // Optional filters supplied by the user
  const storage = numberParam(req.query.storage);
  if (storage) searchFilter.storageGb = storage;
  const colour = textParam(req.query.colour);
  const condition = textParam(req.query.condition);
  const pta = textParam(req.query.pta);
  if (colour) searchFilter.colour = colour;
  if (condition) searchFilter.condition = condition;
  if (pta) searchFilter.ptaStatus = pta;

  let found = await findSearchListings(trimmedQuery, searchFilter);

  // Whether to ask the stores is decided from what this search would show: fresh when one of its results was checked within the
  // freshness window, stale when it has results but all older (answered now, refreshed in the background), missing when it has
  // none (it waits for the stores). Judging by whether a stored title contained the phrase word for word, as before, called
  // "samsung tv" missing even right after 176 Samsung TVs were scraped: every such search waited ~17 s and asked all 23 stores
  // again (found by the load test, 2026-10-26).
  // Not a product name (a link, markup, an endless word): answered from what is stored, the stores are not asked.
  const { done: _refreshDone, ...refreshResult } = !worthAskingStores(trimmedQuery) ? { scraped: false, skipped: "not a product name" } : await fetchAndRefreshListings(trimmedQuery, {
    // Forcing a re-scrape bypasses the freshness window and costs a full round of
    // requests to every store, so it needs the admin key. Anyone else's
    // ?refresh=true is ignored: they simply get the normal cached behaviour.
    force: req.query.refresh === "true" && hasAdminKey(req),
    dynamic: false,
    background: true,
    // Only close spellings found ("walls" -> printers sold for a wall): never judged fresh, the stores are asked. Not waited for
    // since 2026-11-18: "ipad ari" and "gre 1.5 ton" found the iPad Air and Gree ACs and then waited 141-161 s for every store
    // (audit). They are shown at once, labelled as close spellings on the page, and the list updates when the stores answer.
    // Found with fewer words (a pasted store title): the same, shown at once (2026-11-24).
    state: found.matchedBy === "spelling" || found.matchedBy === "fewer_words" ? "stale" : resultsState(found.listings),
  });
  console.log("[search]", refreshResult);

  // The stores were asked and waited for (nothing was stored, or a forced refresh): read the results again.
  if (refreshResult.scraped) found = await findSearchListings(trimmedQuery, searchFilter);
  let { listings } = found;

  // At most MAX_SEARCH_LISTINGS, the most relevant, are grouped: a broad search ("tv": 5,117 listings) took 34 s, and now answers
  // in about a second. `matched` tells the shopper how many there were, so they can narrow it (searchRanking.service.js).
  const selected = selectSearchListings(listings, { query: trimmedQuery, category: queryCategory });
  listings = selected.listings;

  /*
   * Correct processing order:
   *
   * Database listings
   * → attach price history
   * → group and rank products
   * → generate recommendations
   */
  const enrichedListings =
    await attachPriceHistory(listings);

  // Runs in a worker thread when the result set is large (see grouping.service.js).
  // The model searched for is grouped on its own, as without the other models: grouping depends on what it is given, and the
  // related listings split an iPhone 17 and a MacBook Air M5 into more products when grouped with them (2026-11-26).
  const isRelated = (listing) => found.relatedIds?.has(String(listing._id)) ?? false;
  const strategy = resolveMatchStrategy(req);
  const relatedListings = enrichedListings.filter(isRelated);
  const groups = [
    ...(await groupListings(enrichedListings.filter((listing) => !isRelated(listing)), { strategy })),
    ...(relatedListings.length ? await groupListings(relatedListings, { strategy }) : []),
  ];

  // "Lowest we have recorded" on a product's card: the same rule as its outlook (priceOutlook.service.js), from the history attached above.
  for (const group of groups) group.atLow = lowestBadge(group.offers);
  // The product searched for first ("HUAWEI GT 5 Pro" showed the GT 6 Pro, 7 Pro and 2 Pro above it, 2026-11-26): each product's
  // relevance to the search, the results page's default order (frontend lib/filters.js sortGroups), then the most offers.
  for (const group of groups) {
    group.relevance = groupRelevance(group, found.searchedFor || trimmedQuery);
    // the product searched for, or another model shown after it (the results page heads those "Other models")
    group.exact = namesSearch(group, found.searchedFor || trimmedQuery);
  }
  groups.sort((a, b) => b.relevance - a.relevance || storeCount(b) - storeCount(a) || b.offerCount - a.offerCount);

  const recommendedListings =
    createRecommendedListingArray(
      enrichedListings,
      groups
    );

  // The summary is the product searched for, not the other models shown after it (a GT 4's price is not the GT 5's lowest).
  const headlineGroups = groups.some((group) => group.exact) ? groups.filter((group) => group.exact) : groups;
  const headlineIds = new Set(headlineGroups.flatMap((group) => group.offers.map((offer) => String(offer._id))));
  const headlineListings = recommendedListings.filter((listing) => headlineIds.has(String(listing._id)));

  // a price not checked for two weeks is not "the lowest price" (offerFreshness.service.js)
  const prices = currentOffers(headlineListings)
    .map((listing) => Number(listing.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price > 0
    );

  const { lowestPrice, highestPrice, averagePrice } = priceStats(prices);

  const platforms = [
    ...new Set(
      headlineListings
        .map((listing) => listing.platform)
        .filter(Boolean)
    ),
  ];

 /*
   * A "best deal" is only meaningful when the product was actually compared
   * across platforms. Groups holding a single offer are excluded unless no
   * multi-offer group exists, which stops an unrelated one-off listing from
   * outranking a genuinely compared product.
   */
  const comparableGroups = headlineGroups.filter(
    (group) => (group.offerCount || 0) >= 2
  );

  const candidateGroups =
    comparableGroups.length > 0 ? comparableGroups : headlineGroups;

  const bestDeal =
    candidateGroups
      .map((group) => group.bestDeal)
      .filter(Boolean)
      .sort(
        (firstOffer, secondOffer) =>
          Number(secondOffer.dealScore || 0) -
          Number(firstOffer.dealScore || 0)
      )[0] || null;

  res.json({
    success: true,
    refresh: refreshResult,
    query: q,
    count: recommendedListings.length,
    // How many stored listings matched; more than `count` when only the most relevant were grouped.
    matched: selected.matched,
    // How they were found: "exact", "words" (every word, any order) or "spelling" (close spellings: the page says so); null for none.
    matchedBy: found.matchedBy,
    // With "fewer_words": the leading words that found them ("audionic airbud 550"), which the page names.
    searchedFor: found.searchedFor,
    groupCount: groups.length,
    summary: {
      platforms: platforms.length,
      lowestPrice,
      highestPrice,
      averagePrice,
      bestDealPlatform:
        bestDeal?.platform || null,
      bestDealTitle: bestDeal?.title || null,
      bestDealScore:
        bestDeal?.dealScore ?? null,
      bestDealRecommendation:
        bestDeal?.recommendation?.action || null,
    },
    groups,
    data: recommendedListings,
  });
}
