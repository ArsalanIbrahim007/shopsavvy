// SummaryCards.jsx — the four headline numbers above the results: how many stores were compared, the
// lowest price, the biggest saving on one product, and the best deal. All of them follow the filters, and an
// offer flagged as a probable listing error is never presented as the lowest price or the best deal (see
// summarizeOffers).
//
// The lowest price, best deal and saving are about the category the shopper searched for (`main`), named
// when the results also hold other things: a search for "iphone 17 pro" finds cases too. There is no average
// price: across different products (a 256 GB Pro and a 2 TB Pro Max) an average describes nothing. Where PTA-approved phones are
// in view, the lowest price and best deal are among them, and a cheaper non-PTA offer is named beside them (headlinePrices).

import { formatPrice } from "../../lib/format.js";
import { platformName } from "../../lib/platforms.js";
import { summarizeOffers } from "../../lib/summary.js";
import { StoreMark } from "../StoreLogo.jsx";
import "./results.css";

// Each figure has a small drawing, placed after its words (so a screen reader, and the words' order, are unchanged): the stores'
// logos, the store of the lowest price, the saving as the cheapest price against the dearest, and the deal score as a ring.

function StoreStack({ platforms }) {
  const shown = platforms.slice(0, 6);
  return (
    <span className="summary-card__stack" aria-hidden="true">
      {shown.map((platform) => <StoreMark key={platform} platform={platform} size={24} />)}
      {platforms.length > shown.length && <span className="summary-card__more">+{platforms.length - shown.length}</span>}
    </span>
  );
}

function SavingBar({ low, high }) {
  if (!(low > 0) || !(high > low)) return null;
  return (
    <span className="summary-card__bar" aria-hidden="true">
      <span className="summary-card__bar-high" />
      <span className="summary-card__bar-low" style={{ width: `${(low / high) * 100}%` }} />
    </span>
  );
}

const RING = 2 * Math.PI * 15;
function ScoreRing({ score }) {
  if (score === null) return null;
  return (
    <svg className="summary-card__ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <circle className="summary-card__ring-track" cx="18" cy="18" r="15" />
      <circle className="summary-card__ring-fill" cx="18" cy="18" r="15" strokeDasharray={RING} strokeDashoffset={RING * (1 - score / 100)} />
    </svg>
  );
}

// PTA status, said only where non-PTA phones are in view (see headlinePrices): "PTA approved, " before the store when a cheaper
// non-PTA offer is shown beside it, "Non-PTA, " when the price itself is a non-PTA phone's.
const ptaWord = (offer, nonPta) => (offer?.ptaStatus === "non_pta" ? "Non-PTA, " : nonPta ? "PTA approved, " : "");

export default function SummaryCards({ summary, main = summary, mainCategory = null, saving = null, platforms = [] }) {
  const { platformCount, count, outOfDate } = summary;
  const { lowest, bestDeal, preOwnedOnly, nonPta = null } = main;
  const score = Number.isFinite(bestDeal?.dealScore) ? Math.round(bestDeal.dealScore) : null;
  const scope = mainCategory ? `${mainCategory}, ` : "";
  const savingLow = saving ? summarizeOffers(saving.group.offers ?? []).lowest?.price ?? null : null;

  return (
    <div className="summary-cards" role="group" aria-label="Summary of these results">
      <div className="card summary-card">
        <p className="eyebrow">Stores compared</p>
        <p className="summary-card__value">{platformCount}</p>
        <p className="small muted">
          {count} {count === 1 ? "offer" : "offers"} shown
          {outOfDate > 0 ? `, ${outOfDate} with an old price not counted` : ""}
        </p>
        {platforms.length > 0 && <StoreStack platforms={platforms} />}
      </div>
      <div className="card summary-card">
        <p className="eyebrow">{preOwnedOnly ? "Lowest pre-owned price" : "Lowest price"}</p>
        <p className="summary-card__value price">{lowest ? formatPrice(lowest.price) : "—"}</p>
        <p className="small muted">{lowest ? `${scope}${ptaWord(lowest, nonPta)}at ${platformName(lowest.platform)}` : ""}</p>
        {nonPta && (
          <p className="small summary-card__note">Non-PTA from {formatPrice(nonPta.price)} at {platformName(nonPta.platform)}</p>
        )}
        {lowest && <span className="summary-card__corner" aria-hidden="true"><StoreMark platform={lowest.platform} size={28} /></span>}
      </div>
      <div className="card summary-card">
        <p className="eyebrow">Biggest saving</p>
        <p className="summary-card__value price">{saving ? formatPrice(saving.saving) : "—"}</p>
        <p className="small muted">
          {saving ? `on ${saving.group.productName}, cheapest store against dearest` : "No product here is sold at two different prices"}
        </p>
        {saving && <SavingBar low={savingLow} high={savingLow + saving.saving} />}
      </div>
      <div className="card summary-card">
        <p className="eyebrow">Best deal</p>
        <p className="summary-card__value summary-card__value--text">{bestDeal ? platformName(bestDeal.platform) : "—"}</p>
        <p className="small muted">{score !== null ? `${scope}${ptaWord(bestDeal, nonPta)}deal score ${score} out of 100` : "Not scored"}</p>
        <span className="summary-card__corner"><ScoreRing score={score} /></span>
      </div>
    </div>
  );
}
