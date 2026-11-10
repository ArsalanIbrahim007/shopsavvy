// FilterPanel.jsx — stores, price range, sort, category and per-category facets. It only reports what
// the shopper chose (onChange with a partial filters object); the page owns the state, which lives in
// the URL. Rules:
//  - at least one store always stays selected (unchecking the last one does nothing);
//  - price bounds apply when the field is left or Enter is pressed, not on every keystroke;
//  - facets and their counts come from the results themselves and are hidden when there is no real choice.
// Laid out (2026-11-08) as the controls they are: the sort first, as one row of pills (still radio buttons); the stores with their
// logos; the price with its currency in the field; the facets as chips that toggle (still checkboxes).

import { useState } from "react";

import { SORTS } from "../../lib/filters.js";
import { categoryName } from "../../lib/categories.js";
import { formatNumber } from "../../lib/format.js";
import { StoreMark } from "../StoreLogo.jsx";
import "./results.css";

function PriceInput({ label, value, placeholder, onCommit }) {
  // Kept as text while typing; committed on blur or Enter. Re-keyed by the page when the URL value changes.
  const [text, setText] = useState(value === null ? "" : String(value));

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") return onCommit(null);
    const number = Number(trimmed);
    onCommit(Number.isFinite(number) && number >= 0 ? number : null);
  };

  return (
    <label className="filter-price">
      <span className="small muted">{label}</span>
      <span className="filter-price__field">
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      </span>
    </label>
  );
}

export default function FilterPanel({ filters, stores, categories, facets, bounds, canPickCategory, filtered, onChange, onReset, open }) {
  const allStoreIds = stores.map((store) => store.id);
  const selectedStores = filters.platforms ?? allStoreIds;

  function toggleStore(id) {
    const next = selectedStores.includes(id) ? selectedStores.filter((s) => s !== id) : [...selectedStores, id];
    if (next.length === 0) return; // at least one store stays selected
    onChange({ platforms: next.length === allStoreIds.length ? null : next });
  }

  function toggleFacet(key, value) {
    const current = filters[key];
    onChange({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
  }

  return (
    <aside className={open ? "filters card is-open" : "filters card"} aria-label="Filters">
      <fieldset className="filter-group">
        <legend className="eyebrow">Sort by</legend>
        <div className="sort-pills">
          {SORTS.map((sort) => (
            <label key={sort.id} className="sort-pill">
              <input type="radio" name="sort" checked={filters.sort === sort.id} onChange={() => onChange({ sort: sort.id })} />
              <span>{sort.label}</span>
              {sort.hint && <span className="filter-pick small">{sort.hint}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend className="eyebrow">Stores <span className="muted">{stores.length}</span></legend>
        {stores.map((store) => (
          <label key={store.id} className="filter-check filter-check--store">
            <input type="checkbox" checked={selectedStores.includes(store.id)} onChange={() => toggleStore(store.id)} />
            <StoreMark platform={store.id} size={22} />
            <span>{store.name}</span>
            <span className="filter-check__count small muted">{formatNumber(store.count)}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="filter-group">
        <legend className="eyebrow">Price range (PKR)</legend>
        <div className="filter-price-row">
          <PriceInput key={`min-${filters.minPrice}`} label="Min" value={filters.minPrice} placeholder={formatNumber(bounds.min)} onCommit={(minPrice) => onChange({ minPrice })} />
          <PriceInput key={`max-${filters.maxPrice}`} label="Max" value={filters.maxPrice} placeholder={formatNumber(bounds.max)} onCommit={(maxPrice) => onChange({ maxPrice })} />
        </div>
      </fieldset>

      {canPickCategory && categories.length > 1 && (
        <fieldset className="filter-group">
          <legend className="eyebrow">Category</legend>
          <div className="filter-chips">
            <button type="button" className="chip" aria-pressed={filters.category === "all"} onClick={() => onChange({ category: "all" })}>
              All
            </button>
            {categories.map(({ category, count }) => (
              <button key={category} type="button" className="chip" aria-pressed={filters.category === category} onClick={() => onChange({ category })}>
                {categoryName(category)} <span className="muted">{count}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {facets.map((facet) => (
        <fieldset key={facet.key} className="filter-group">
          <legend className="eyebrow">{facet.title}</legend>
          <div className="facet-chips">
            {facet.options.map((option) => (
              // An option no offer can meet with the other choices is greyed out (still one to untick if chosen).
              <label key={String(option.value)} className={option.count === 0 && !filters[facet.key].includes(option.value) ? "facet-chip facet-chip--empty" : "facet-chip"}>
                <input
                  type="checkbox"
                  checked={filters[facet.key].includes(option.value)}
                  disabled={option.count === 0 && !filters[facet.key].includes(option.value)}
                  onChange={() => toggleFacet(facet.key, option.value)}
                />
                <span>{option.label}</span>
                <span className="facet-chip__count">{formatNumber(option.count)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {filtered && (
        <button type="button" className="btn btn-ghost filter-reset" onClick={onReset}>
          Reset filters
        </button>
      )}
    </aside>
  );
}
