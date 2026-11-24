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
import { modelKey, modelName, rememberedVariants, rememberVariants, variantRows } from "../../lib/variants.js";
import { prefetchProps } from "../../lib/prefetch.js";
import "./VariantPicker.css";

const CATEGORIES = new Set(["smartphone", "tablet", "laptop"]);

/** The rows' shape, greyed, while the versions are looked up. */
function VariantSkeleton() {
  return (
    <div className="variant-picker" aria-hidden="true">
      <div className="variant-picker__row">
        <span className="skeleton variant-skeleton__label" />
        <div className="variant-picker__options">
          {[0, 1, 2].map((i) => <span key={i} className="skeleton variant-skeleton__tile" />)}
        </div>
      </div>
    </div>
  );
}

const groupsOf = (answer) => (Array.isArray(answer?.groups) ? answer.groups : []);

export default function VariantPicker({ group, category }) {
  const model = CATEGORIES.has(category) ? modelName(group.productName) : "";
  // remembered under the model's key, the same for every version ("iPhone 17 Pro Max 256GB", "Apple iPhone 17 Pro Max 512GB")
  const key = model ? modelKey(group.productName) : "";
  const fresh = rememberedVariants(key);
  // A bonus: a search that fails (or a page without the search at all) shows no rows rather than an error. Not asked again while
  // the model's versions are remembered.
  const siblings = useAsync(
    (signal) => {
      if (!model || fresh) return Promise.resolve({ groups: fresh ?? [] });
      return Promise.resolve()
        .then(() => searchListings({ q: model, signal }))
        .then((answer) => {
          rememberVariants(key, groupsOf(answer));
          return answer;
        })
        .catch(() => ({ groups: [] }));
    },
    [key, model],
  );
  if (!model) return null;
  // the first visit to a model: a placeholder of the rows' shape while the search runs, so the page does not jump when they appear
  if (!fresh && siblings.status === "loading") return <VariantSkeleton />;
  if (!fresh && siblings.status !== "success") return null;

  // an answer without groups (an empty or odd reply) shows no rows; it never breaks the product page (CI, 2026-11-24)
  const rows = variantRows(group, fresh ?? groupsOf(siblings.data));
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
                <Link key={option.label} {...prefetchProps(option.target._id)} className="variant-tile" to={productPath(option.target._id, option.target.title)}>
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
