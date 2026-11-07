// DropChance.jsx — the trained drop forecast on the product page (backend/src/services/dropChance.service.js): which stores' prices
// are among the 5% it ranks most likely to fall 3% or more within a week, and what that has meant in the strict test. It says how
// much more often such prices dropped, and how rarely that still is: never that a price will drop. Nothing when no price is flagged.

import { platformName } from "../../lib/platforms.js";
import { dropChanceText } from "../../lib/dropChance.js";

export default function DropChance({ chances }) {
  const text = dropChanceText(chances, platformName);
  if (!text) return null;
  return (
    <section className="product-section card drop-chance" aria-labelledby="drop-heading">
      <h2 id="drop-heading">Higher chance of a price drop this week</h2>
      <p>{text.lead}</p>
      <p className="small muted">{text.caveat}</p>
    </section>
  );
}
