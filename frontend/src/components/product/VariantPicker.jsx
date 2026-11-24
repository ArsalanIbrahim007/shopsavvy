// VariantPicker.jsx — the product page's Storage / RAM / PTA rows, as Qeemat shows them (2026-11-21): each option with its lowest
// price, the cheapest of a row marked "Best deal", the current one outlined. Each storage, RAM or PTA version is its own product, so
// an option opens that version's page (lib/variants.js picks the one that keeps the other choices). The colour row stays on the page
// itself (ColourPicker.jsx), where each colour has its own price.
//
// The versions come from a search for the model ("iPhone 17 Pro Max"), the same search the site runs; while it loads, and when the
// model has only one version, nothing is shown.

import { Link } from "react-router-dom";

import { searchListings } from "../../api/endpoints.js";
import { useAsync } from "../../hooks/useAsync.js";
import { formatPrice } from "../../lib/format.js";
import { productPath } from "../../lib/productPath.js";
import { modelName, variantRows } from "../../lib/variants.js";
import "./VariantPicker.css";

const CATEGORIES = new Set(["smartphone", "tablet", "laptop"]);

export default function VariantPicker({ group, category }) {
  const model = CATEGORIES.has(category) ? modelName(group.productName) : "";
  // A bonus: a search that fails (or a page without the search at all) shows no rows rather than an error.
  const siblings = useAsync(
    (signal) => (model ? Promise.resolve().then(() => searchListings({ q: model, signal })).catch(() => ({ groups: [] })) : Promise.resolve({ groups: [] })),
    [model],
  );
  if (!model || siblings.status !== "success") return null;

  const rows = variantRows(group, siblings.data.groups);
  if (rows.length === 0) return null;

  return (
    <div className="variant-picker">
      {rows.map((row) => (
        <div key={row.key} className="variant-picker__row" role="group" aria-label={row.title}>
          <p className="eyebrow">{row.title}</p>
          <div className="variant-picker__options">
            {row.options.map((option) =>
              option.current ? (
                <span key={option.label} className="variant-tile" aria-current="true">
                  {option.best && <span className="variant-tile__best">Best deal</span>}
                  <span className="variant-tile__label">{option.label}</span>
                  <span className="variant-tile__price">{formatPrice(option.price)}</span>
                </span>
              ) : (
                <Link key={option.label} className="variant-tile" to={productPath(option.target._id, option.target.title)}>
                  {option.best && <span className="variant-tile__best">Best deal</span>}
                  <span className="variant-tile__label">{option.label}</span>
                  <span className="variant-tile__price">{formatPrice(option.price)}</span>
                </Link>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
