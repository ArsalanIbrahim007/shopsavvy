// IntegrityStrip.jsx — "ShopSavvy flagged N offers": shown only when at least one offer in view has a
// discount or price we do not trust. The reason quoted is the server's own, for the first flagged offer.

import { isDiscountDoubtful } from "../../lib/filters.js";
import { offerFlags } from "../../lib/verdicts.js";
import { platformName } from "../../lib/platforms.js";
import "./results.css";

export default function IntegrityStrip({ offers }) {
  const flagged = offers.filter(isDiscountDoubtful);
  if (flagged.length === 0) return null;

  const first = flagged[0];
  const reason = offerFlags(first).find((flag) => flag.reason)?.reason;

  return (
    <div className="integrity card" role="note">
      <span className="integrity__icon" aria-hidden="true">!</span>
      <div>
        <p className="integrity__title">
          ShopSavvy flagged {flagged.length} {flagged.length === 1 ? "offer" : "offers"} with a doubtful discount or price.
        </p>
        {reason && (
          <p className="small muted">
            {platformName(first.platform)}: {reason}
          </p>
        )}
      </div>
    </div>
  );
}
