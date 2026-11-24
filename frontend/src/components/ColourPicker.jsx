// ColourPicker.jsx — choose which colour of a product to look at, the way a phone shop does it: a row of pictures, one
// per colour, the chosen one outlined, and "Colour: Teal" above. Choosing a colour keeps that colour's offers (plus offers
// that do not state a colour, see lib/colours.js) and the product's main picture follows the choice. Choosing it again, or
// "All colours", goes back to every offer.
//
// A colour with no picture gets a colour swatch instead. The name is always written under it, so colour never carries the
// meaning alone. Also exports the small swatch strip the product cards use.

import { useState } from "react";

import { coloursOf, offersInColour, swatchFor } from "../lib/colours.js";
import { formatPrice } from "../lib/format.js";
import { summarizeOffers } from "../lib/summary.js";
import "./ColourPicker.css";

export function Swatch({ colour }) {
  const hex = swatchFor(colour);
  return <span className={hex ? "swatch" : "swatch swatch--unknown"} style={hex ? { background: hex } : undefined} aria-hidden="true" />;
}

/** A picture of one colour; a swatch if there is none or it does not load (store pictures break often). */
function Thumb({ colour, image }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return <img className="colour-tile__image" src={image} alt="" width="64" height="64" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  const hex = swatchFor(colour);
  return <span className="colour-tile__fill" style={hex ? { background: hex } : undefined} aria-hidden="true" />;
}

/** A row of up to `max` swatches and "N colours", for a product card. Nothing for a product with fewer than two colours. */
export function ColourStrip({ offers, max = 6 }) {
  const colours = coloursOf(offers);
  if (colours.length < 2) return null;
  const names = colours.map((c) => c.colour).join(", ");
  return (
    <p className="colour-strip small muted" title={names}>
      <span className="colour-strip__dots" aria-hidden="true">
        {colours.slice(0, max).map(({ colour }) => <Swatch key={colour} colour={colour} />)}
      </span>
      {colours.length} colours
      <span className="visually-hidden">: {names}</span>
    </p>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.offers  every offer of the product
 * @param {string|null} props.value  the chosen colour, or null for all
 * @param {(colour: string|null) => void} props.onChange
 */
export default function ColourPicker({ offers, value, onChange }) {
  const colours = coloursOf(offers);
  if (colours.length < 2) return null; // nothing to choose between
  // Each colour's lowest price, the way a shop's colour buttons show it (2026-11-21): the offers in that colour, at that colour's own
  // price where the store gives one. The cheapest colour is marked, when the colours do differ.
  const priced = new Map(colours.map(({ colour }) => [colour, summarizeOffers(offersInColour(offers, colour)).lowest?.price ?? null]));
  const known = [...priced.values()].filter((p) => p > 0);
  const cheapest = known.length > 1 && Math.min(...known) < Math.max(...known) ? Math.min(...known) : null;

  return (
    <div className="colour-picker" role="group" aria-label="Colour">
      <p className="colour-picker__current">
        <span className="eyebrow">Colour</span>
        <strong>{value ?? "All colours"}</strong>
        {value && <button type="button" className="colour-picker__clear small" onClick={() => onChange(null)}>Show all colours</button>}
      </p>
      <div className="colour-picker__options">
        {colours.map(({ colour, count, image }) => {
          const chosen = value === colour;
          return (
            <button
              key={colour}
              type="button"
              className="colour-tile"
              aria-pressed={chosen}
              onClick={() => onChange(chosen ? null : colour)}
            >
              {cheapest !== null && priced.get(colour) === cheapest && <span className="colour-tile__best">Best deal</span>}
              <Thumb colour={colour} image={image} />
              <span className="colour-tile__name small">{colour}</span>
              {priced.get(colour) > 0 && <span className="colour-tile__price small">{formatPrice(priced.get(colour))}</span>}
              <span className="visually-hidden">, {count} {count === 1 ? "offer" : "offers"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
