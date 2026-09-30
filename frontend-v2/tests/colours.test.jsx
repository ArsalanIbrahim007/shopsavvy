import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";

import { colourOf, coloursOf, collapseVariants, offerCount, offersInColour, swatchFor, unstatedColourCount } from "../src/lib/colours.js";
import { summarizeOffers } from "../src/lib/summary.js";
import { hoverRows, buildSeries } from "../src/lib/history.js";
import ColourPicker, { ColourStrip } from "../src/components/ColourPicker.jsx";
import OfferTable from "../src/components/results/OfferTable.jsx";
import ResultGroup from "../src/components/results/ResultGroup.jsx";
import ProductCard from "../src/components/ProductCard.jsx";

const offer = (id, platform, price, colour, over = {}) => ({
  _id: id, platform, price, colour, title: "Apple iPad Air 11", productCategory: "tablet", inStock: true, lastScrapedAt: new Date().toISOString(),
  productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});

// The real case (Arsalan, 2026-10-01): Paklap lists the iPad Air once per colour, all at PKR 275,000.
const ipad = () => [
  offer("sg", "paklap", 275000, "Space grey"),
  offer("st", "paklap", 275000, "Starlight"),
  offer("pu", "paklap", 275000, "Purple"),
  offer("bl", "paklap", 275000, "Blue"),
];
const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("colours library", () => {
  it("lists the colours with how many offers have each, most first, leaving out offers that state none", () => {
    const offers = [...ipad(), offer("x", "mega", 280000, "Blue"), offer("y", "priceoye", 281000, null), offer("z", "shophive", 282000, undefined)];
    expect(coloursOf(offers)).toEqual([
      { colour: "Blue", count: 2 }, { colour: "Purple", count: 1 }, { colour: "Space grey", count: 1 }, { colour: "Starlight", count: 1 },
    ]);
    expect(coloursOf([])).toEqual([]);
    expect(coloursOf(undefined)).toEqual([]);
    expect(unstatedColourCount(offers)).toBe(2);
    expect(colourOf({ colour: "" })).toBeNull();
  });

  it("choosing a colour keeps that colour and the offers that do not say; choosing none keeps everything", () => {
    const offers = [...ipad(), offer("y", "priceoye", 281000, null)];
    expect(offersInColour(offers, "Blue").map((o) => o._id)).toEqual(["bl", "y"]);
    expect(offersInColour(offers, null)).toBe(offers);
    expect(offersInColour(offers, "Green").map((o) => o._id)).toEqual(["y"]);
    expect(offersInColour(undefined, "Blue")).toEqual([]);
  });

  it("collapses one store's colours at one price into a single offer that lists them", () => {
    const entries = collapseVariants(ipad());
    expect(entries).toHaveLength(1);
    expect(entries[0].colours).toEqual(["Space grey", "Starlight", "Purple", "Blue"]);
    expect(entries[0].variants).toHaveLength(4);
    expect(offerCount(ipad())).toBe(1);
  });

  it("keeps a store's different prices apart, because a colour that costs more is worth knowing", () => {
    const offers = [offer("a", "paklap", 275000, "Blue"), offer("b", "paklap", 279999, "Purple"), offer("c", "paklap", 275000, "Starlight")];
    const entries = collapseVariants(offers);
    expect(entries.map((e) => [e.offer.price, e.colours])).toEqual([[275000, ["Blue", "Starlight"]], [279999, ["Purple"]]]);
    expect(offerCount(offers)).toBe(2);
  });

  it("keeps different stores apart, including the same price", () => {
    expect(offerCount([offer("a", "paklap", 100, "Blue"), offer("b", "mega", 100, "Blue"), offer("c", "Mega.pk", 100, "Red")])).toBe(2); // Mega and "Mega.pk" are one store
  });

  it("lets the chosen colour, or the listing that was opened, stand for its row", () => {
    expect(collapseVariants(ipad(), { colour: "Purple" })[0].offer._id).toBe("pu");
    expect(collapseVariants(ipad(), { currentId: "st" })[0].offer._id).toBe("st");
    expect(collapseVariants(ipad(), { colour: "Purple", currentId: "st" })[0].offer._id).toBe("st"); // the opened one wins
    expect(collapseVariants(ipad(), { colour: "Green" })[0].offer._id).toBe("sg"); // a colour it does not have: the first
    expect(collapseVariants(ipad())[0].offer._id).toBe("sg");
  });

  it("has a swatch for the colours the backend can name, and none for an unknown one", () => {
    for (const name of ["black", "space grey", "Natural Titanium", "Starlight", "Blue", "Orange"]) expect(swatchFor(name)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatchFor("Plaid")).toBeNull();
    expect(swatchFor(undefined)).toBeNull();
  });

  it("counts an offer once however many colours it comes in (summary and chart readout)", () => {
    expect(summarizeOffers(ipad()).count).toBe(1);
    expect(summarizeOffers([...ipad(), offer("m", "mega", 279999, null)]).count).toBe(2);
    const history = (id) => ({ _id: id, platform: "paklap", priceHistory: [{ price: 275000, recordedAt: new Date(Date.now() - 5 * 86400000).toISOString() }] });
    const series = buildSeries(["a", "b", "c"].map(history), "all", { currentId: "b" });
    const rows = hoverRows(series, Date.now());
    expect(rows).toHaveLength(1); // three identical lines: one row in the readout
    expect(rows[0].isCurrent).toBe(true);
  });
});

describe("ColourPicker", () => {
  it("offers 'All colours' and each colour with its count, and reports the choice", () => {
    const seen = [];
    inRouter(<ColourPicker offers={[...ipad(), offer("x", "mega", 280000, "Blue")]} value={null} onChange={(c) => seen.push(c)} />);
    expect(screen.getByRole("button", { name: "All colours" })).toHaveAttribute("aria-pressed", "true");
    const blue = screen.getByRole("button", { name: /^Blue/ });
    expect(blue).toHaveTextContent("2");
    expect(blue).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(blue);
    fireEvent.click(screen.getByRole("button", { name: "All colours" }));
    expect(seen).toEqual(["Blue", null]);
  });

  it("marks the chosen colour", () => {
    inRouter(<ColourPicker offers={ipad()} value="Purple" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^Purple/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All colours" })).toHaveAttribute("aria-pressed", "false");
  });

  it("is not shown when there is nothing to choose between", () => {
    const { container } = inRouter(<ColourPicker offers={[offer("a", "paklap", 1, "Blue"), offer("b", "mega", 2, null)]} value={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("OfferTable with colours", () => {
  it("shows a store's colour variants as one row that lists its colours", () => {
    inRouter(<OfferTable offers={ipad()} name="iPad Air" />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Space grey, Starlight, Purple, Blue");
  });

  it("marks the row holding the opened listing, the lowest price and the best deal, whichever colour it is", () => {
    const offers = [...ipad(), offer("m", "mega", 290000, null, { dealScore: 50 })];
    inRouter(<OfferTable offers={offers} name="iPad Air" currentId="pu" />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Lowest price");
    expect(rows[0]).toHaveTextContent("The one you opened");
    expect(rows[1]).not.toHaveTextContent("The one you opened");
  });

  it("links to the chosen colour's listing, and says 'Colour not stated' for an offer with none while a colour is chosen", () => {
    const offers = [...ipad(), offer("m", "mega", 290000, null)];
    inRouter(<OfferTable offers={offersInColour(offers, "Purple")} name="iPad Air" colour="Purple" />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByRole("link", { name: /view deal at paklap/i })).toHaveAttribute("href", "https://paklap.example.com/pu");
    expect(rows[1]).toHaveTextContent("Colour not stated");
  });
});

describe("ResultGroup colour choice", () => {
  const Probe = ({ offers }) => {
    const [params, setParams] = useSearchParams();
    return (
      <ResultGroup
        group={{ productName: "Apple iPad Air 11", offers }}
        colour={params.get("colour")}
        onColour={(c) => setParams(c ? { colour: c } : {})}
      />
    );
  };
  const mount = (offers, path = "/") => render(
    <MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<Probe offers={offers} />} /></Routes></MemoryRouter>
  );

  it("says one offer from one store, not four, and lists the colours", () => {
    mount(ipad());
    expect(screen.getByText(/^1 offer from 1 store/)).toBeInTheDocument();
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
  });

  it("choosing a colour keeps that colour's offers and the unstated ones, and says so", () => {
    const offers = [...ipad(), offer("m", "mega", 290000, null), offer("o", "shophive", 285000, "Blue")];
    mount(offers);
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(3); // paklap, shophive, mega
    fireEvent.click(screen.getByRole("button", { name: /^Blue/ }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3); // paklap (its Blue one), shophive, and mega which does not say
    expect(screen.getByText(/1 offer does not say which colour, so it stays in the list/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Purple/ }));
    const purple = screen.getAllByRole("row").slice(1);
    expect(purple).toHaveLength(2); // paklap and mega; shophive has no Purple
    expect(purple.map((r) => r.textContent).join(" ")).not.toContain("Shophive");
    fireEvent.click(screen.getByRole("button", { name: "All colours" }));
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(3);
    expect(screen.queryByText(/not say which colour/)).toBeNull();
  });

  it("reads the colour from the address and ignores one the product does not have", () => {
    mount([...ipad(), offer("m", "mega", 290000, null)], "/?colour=Purple");
    expect(screen.getByRole("button", { name: /^Purple/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("an old link with a colour nobody sells shows everything", () => {
    mount([...ipad(), offer("m", "mega", 290000, null)], "/?colour=Chartreuse");
    expect(screen.getByRole("button", { name: "All colours" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(2);
  });

  it("has no picker for a product that comes in one colour", () => {
    mount([offer("a", "paklap", 1, "Blue"), offer("b", "mega", 2, "Blue")]);
    expect(screen.queryByRole("group", { name: "Colour" })).toBeNull();
  });
});

describe("ProductCard colours", () => {
  it("counts the offers without the colour copies, and shows the colours it comes in", () => {
    inRouter(<ProductCard group={{ productName: "Apple iPad Air 11", offers: ipad() }} />);
    expect(screen.getByText(/^1 offer from 1 store$/)).toBeInTheDocument();
    expect(screen.getByText(/4 colours/)).toBeInTheDocument();
    expect(screen.getByText(/: Blue, Purple, Space grey, Starlight/)).toBeInTheDocument(); // by count, then name
  });

  it("shows no colour line for a single colour or none", () => {
    const { container } = inRouter(<ColourStrip offers={[offer("a", "paklap", 1, "Blue"), offer("b", "mega", 1, null)]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
