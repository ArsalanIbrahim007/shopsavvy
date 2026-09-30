// ColourPicker.jsx — choose which colour of a product to look at. "All colours" shows every offer (colour variants of
// one store at one price appear as one row); a colour keeps that colour's offers, plus offers that do not state a
// colour (see lib/colours.js). The swatch is a hint; the name is always written, so colour never carries the meaning alone.
// Also exports the small swatch strip the product cards use.

import { coloursOf, swatchFor } from "../lib/colours.js";
import "./ColourPicker.css";

export function Swatch({ colour }) {
  const hex = swatchFor(colour);
  return <span className={hex ? "swatch" : "swatch swatch--unknown"} style={hex ? { background: hex } : undefined} aria-hidden="true" />;
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

  return (
    <div className="colour-picker" role="group" aria-label="Colour">
      <span className="eyebrow">Colour</span>
      <div className="colour-picker__options">
        <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange(null)}>
          All colours
        </button>
        {colours.map(({ colour, count }) => (
          <button key={colour} type="button" className="chip colour-picker__option" aria-pressed={value === colour} onClick={() => onChange(colour)}>
            <Swatch colour={colour} />
            {colour}
            <span className="muted small">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
