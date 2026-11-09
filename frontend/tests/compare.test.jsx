// The Compare feature: the picked list (lib/compare.js), the spec rows and their best values (lib/specs.js), the Compare button
// and tray, the Compare page, and the product page's specifications from the stores' pages.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({ compareProducts: vi.fn() }));

import * as api from "../src/api/endpoints.js";
import { clearCompare, compareIds, comparePath, COMPARE_MAX, getCompare, resetCompareCache, toggleCompare } from "../src/lib/compare.js";
import { bestOf, buildPageSpecs, formatSpec } from "../src/lib/specs.js";
import CompareButton from "../src/components/CompareButton.jsx";
import CompareTray from "../src/components/CompareTray.jsx";
import Specifications from "../src/components/product/Specifications.jsx";
import Compare from "../src/pages/Compare.jsx";

const id = (n) => String(n).padStart(24, "a");
const phone = (n) => ({ id: id(n), name: `Phone ${n}`, category: "smartphone" });

beforeEach(() => {
  localStorage.clear();
  resetCompareCache();
});

describe("the picked list", () => {
  it("adds and removes, keeps one kind of product and at most four", () => {
    expect(toggleCompare(phone(1))).toEqual({ ok: true, added: true });
    expect(toggleCompare({ id: id(9), name: "Laptop", category: "laptop" })).toMatchObject({ ok: false });
    for (const n of [2, 3, 4]) toggleCompare(phone(n));
    expect(getCompare()).toHaveLength(COMPARE_MAX);
    expect(toggleCompare(phone(5))).toMatchObject({ ok: false });
    expect(toggleCompare(phone(1))).toEqual({ ok: true, added: false });
    expect(getCompare().map((i) => i.name)).toEqual(["Phone 2", "Phone 3", "Phone 4"]);
    expect(comparePath()).toBe(`/compare?ids=${id(2)},${id(3)},${id(4)}`);
    resetCompareCache();
    expect(getCompare()).toHaveLength(3); // kept in this browser
  });

  it("takes the ids from the address first, listing ids only, each once", () => {
    toggleCompare(phone(1));
    toggleCompare(phone(2));
    expect(compareIds(`${id(7)},nonsense,${id(7)},${id(8)}`)).toEqual([id(7), id(8)]);
    expect(compareIds(null)).toEqual([id(1), id(2)]);
  });
});

describe("spec rows", () => {
  it("formats values and marks the best of each row, higher, lower or by order, ties all best", () => {
    expect(formatSpec("batteryMah", 5000)).toBe("5,000 mAh");
    expect(formatSpec("weightG", 1830)).toBe("1.83 kg");
    expect(formatSpec("has5g", false)).toBe("No");
    expect(formatSpec("ramGb", null)).toBeNull();
    expect(bestOf("ramGb", [8, 12, undefined])).toEqual([1]);
    expect(bestOf("weightG", [177, 189])).toEqual([0]);
    expect(bestOf("chipsetTier", ["mid", "flagship", "mid"])).toEqual([1]);
    expect(bestOf("displayType", ["LCD", "AMOLED"])).toEqual([1]);
    expect(bestOf("refreshHz", [120, 120])).toEqual([]); // all the same: nothing to mark
    expect(bestOf("batteryMah", [5000, null])).toEqual([]); // one value: nothing to compare
    expect(bestOf("os", ["Android 15", "iOS 26"])).toEqual([]); // text has no better
    expect(buildPageSpecs({ chipset: "Apple A19", batteryMah: 3692, nfc: true })).toEqual([["Chipset", "Apple A19"], ["Battery", "3,692 mAh"], ["NFC", "Yes"]]);
  });
});

describe("the button and the tray", () => {
  it("toggles a product, says why it cannot add another kind, and the tray opens the comparison from two", () => {
    render(
      <MemoryRouter>
        <CompareButton item={phone(1)} />
        <CompareButton item={{ id: id(9), name: "Laptop", category: "laptop" }} />
        <CompareButton item={phone(2)} />
        <CompareTray />
      </MemoryRouter>
    );
    const [first, laptop, second] = screen.getAllByRole("button", { name: /compare/i });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/pick one more/i)).toBeInTheDocument();
    fireEvent.click(laptop);
    expect(screen.getByRole("alert")).toHaveTextContent(/one kind of product/i);
    fireEvent.click(second);
    expect(screen.getByRole("link", { name: "Compare 2" })).toHaveAttribute("href", `/compare?ids=${id(1)},${id(2)}`);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("complementary", { name: /products to compare/i })).toBeNull();
  });
});

const product = (n, over = {}) => ({
  id: id(n), name: `Phone ${n}`, category: "smartphone", image: null, lowestPrice: 50000 + n * 1000, offerCount: 3, stores: 2,
  ptaStatus: "pta_approved", bestOffer: { platform: "priceoye", price: 50000 + n * 1000, url: "https://priceoye.pk/x", title: "x" },
  specs: null, specsFrom: [], specScore: null, rank: null, ...over,
});

function renderCompare(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/compare" element={<Compare />} /></Routes>
    </MemoryRouter>
  );
}

describe("the Compare page", () => {
  it("shows the products side by side with the best value of each row marked, and says where the specs come from", async () => {
    vi.mocked(api.compareProducts).mockReset().mockResolvedValue({
      products: [
        product(1, { specs: { ramGb: 8, batteryMah: 5000, chipset: "Helio G85" }, specsFrom: ["priceoye"], specScore: { score: 61, parts: [1, 2, 3, 4] }, rank: { rank: 2, of: 9, band: { min: 50000, max: 60000 } } }),
        product(2, { specs: { ramGb: 12, batteryMah: 5000 }, specsFrom: ["ishopping"], specScore: { score: 74, parts: [1, 2, 3, 4, 5] } }),
      ],
    });
    renderCompare(`/compare?ids=${id(1)},${id(2)}`);
    expect(await screen.findByRole("heading", { name: /compare 2 smartphones/i })).toBeInTheDocument();
    expect(api.compareProducts).toHaveBeenCalledWith([id(1), id(2)], expect.anything());
    const ram = screen.getByRole("row", { name: /^RAM/ });
    expect(within(ram).getAllByRole("cell")[1]).toHaveTextContent("12 GB Best");
    expect(within(screen.getByRole("row", { name: /^Battery/ })).queryByText("Best")).toBeNull(); // the same on both
    expect(within(screen.getByRole("row", { name: /^Chipset/ })).getAllByRole("cell")[1]).toHaveAccessibleName(/not stated/i);
    expect(screen.getByText(/#2 of 9 smartphones priced/i)).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Lowest price/ })).getAllByRole("cell")[0]).toHaveTextContent(/cheapest/i);
    expect(screen.getByText(/stores' own product pages \(PriceOye, iShopping\)/i)).toBeInTheDocument();
  });

  it("without two products, explains how to pick them; asks for nothing", () => {
    vi.mocked(api.compareProducts).mockReset();
    renderCompare("/compare");
    expect(screen.getByRole("heading", { name: /pick products to compare/i })).toBeInTheDocument();
    expect(api.compareProducts).not.toHaveBeenCalled();
  });

  it("removing a product drops it from the address and the picked list", async () => {
    toggleCompare(phone(1));
    toggleCompare(phone(2));
    toggleCompare(phone(3));
    vi.mocked(api.compareProducts).mockReset().mockImplementation(async (ids) => ({ products: ids.map((i) => product(Number(i.slice(-1)), { id: i })) }));
    renderCompare(`/compare?ids=${id(1)},${id(2)},${id(3)}`);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone 3" }));
    await waitFor(() => expect(api.compareProducts).toHaveBeenLastCalledWith([id(1), id(2)], expect.anything()));
    expect(getCompare().map((i) => i.id)).toEqual([id(1), id(2)]);
    clearCompare();
  });
});

describe("the product page's specifications", () => {
  it("shows the stores' sheet and its score when a page stated one, else what the title says", () => {
    const listing = { storageGb: 256, ramGb: 8, productCategory: "smartphone" };
    const { rerender } = render(<Specifications listing={listing} specs={{ sheet: { chipset: "Exynos 1330", batteryMah: 5000 }, from: ["ishopping"], score: { score: 63, parts: [1, 2, 3, 4] } }} />);
    expect(screen.getByRole("row", { name: /Chipset Exynos 1330/ })).toBeInTheDocument();
    expect(screen.getByText(/Specs score/)).toHaveTextContent("63/100");
    expect(screen.getByText(/stores' own product pages \(iShopping\)/i)).toBeInTheDocument();
    rerender(<Specifications listing={listing} specs={null} />);
    expect(screen.getByText(/derived from the product title/i)).toBeInTheDocument();
  });
});
