import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ptaFlag, ptaNotice } from "../src/lib/pta.js";
import { bestDealOffer } from "../src/lib/score.js";
import { summarizeOffers } from "../src/lib/summary.js";
import OfferTable from "../src/components/results/OfferTable.jsx";
import ResultGroup from "../src/components/results/ResultGroup.jsx";
import ProductCard from "../src/components/ProductCard.jsx";

const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Apple iPhone 17", productCategory: "smartphone", inStock: true, lastScrapedAt: new Date().toISOString(),
  productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

// The real case: a PTA-approved iPhone 17 at PKR 370,000 and one at 390,000, a store that does not say either way
// at PKR 360,000, and one priced like a non-PTA unit.
const approved = (id, platform, price, over = {}) => offer(id, platform, price, { ptaStatus: "pta_approved", ...over });
const mixed = () => [
  offer("quiet", "ishopping", 360000, { ptaStatus: "unknown", ptaAssessment: "not_stated", dealScore: 97 }),
  approved("a", "mega", 369999, { dealScore: 90 }),
  approved("b", "shophive", 389999, { dealScore: 80 }),
];

describe("ptaFlag", () => {
  it("labels what the server found out", () => {
    expect(ptaFlag(approved("a", "mega", 1))).toMatchObject({ label: "PTA approved", tone: "good" });
    expect(ptaFlag(offer("n", "mega", 1, { ptaStatus: "non_pta" }))).toMatchObject({ label: "Non-PTA", tone: "caution" });
    expect(ptaFlag(offer("q", "mega", 1, { ptaAssessment: "not_stated" }))).toMatchObject({ label: "PTA not stated", tone: "neutral" });
    expect(ptaFlag(offer("l", "mega", 1, { ptaAssessment: "likely_non_pta" }))).toMatchObject({ label: "May be non-PTA", tone: "caution" });
  });

  it("says when the status was read from the store's product page rather than its title", () => {
    expect(ptaFlag(approved("a", "ishopping", 1, { ptaSource: "product_page" })).reason).toBe("The store's product page says this phone is PTA approved.");
    expect(ptaFlag(approved("a", "mega", 1, { ptaSource: "title" })).reason).toBe("The store says this phone is PTA approved.");
    expect(ptaFlag(offer("n", "mega", 1, { ptaStatus: "non_pta", ptaSource: "product_page" })).reason).toMatch(/^The store's product page says this phone is not PTA approved/);
    expect(ptaFlag(approved("a", "mega", 1, { ptaSource: "product_page" })).label).toBe("PTA approved");
  });

  it("explains every label, and says nothing when there is nothing to say", () => {
    for (const over of [{ ptaStatus: "pta_approved" }, { ptaStatus: "non_pta" }, { ptaAssessment: "not_stated" }, { ptaAssessment: "likely_non_pta" }]) {
      expect(ptaFlag(offer("x", "mega", 1, over)).reason.length).toBeGreaterThan(20);
    }
    expect(ptaFlag(offer("u", "mega", 1, { ptaStatus: "unknown" }))).toBeNull();
    expect(ptaFlag(offer("o", "mega", 1))).toBeNull();
    expect(ptaFlag(undefined)).toBeNull();
  });

  it("puts the server's assessment ahead of the stored status", () => {
    expect(ptaFlag(offer("q", "mega", 1, { ptaStatus: "unknown", ptaAssessment: "likely_non_pta" })).label).toBe("May be non-PTA");
    // the server is the authority: if the two ever disagree, what it worked out from the whole product wins
    expect(ptaFlag(offer("q", "mega", 1, { ptaStatus: "pta_approved", ptaAssessment: "not_stated" })).label).toBe("PTA not stated");
  });
});

describe("ptaNotice", () => {
  it("counts the offers that do not say, and tells the shopper what the best deal considers", () => {
    expect(ptaNotice(mixed())).toMatch(/^1 offer does not say whether the phone is PTA approved\. The best deal only counts offers that do/);
    const two = [...mixed(), offer("q2", "priceoye", 384999, { ptaAssessment: "not_stated" })];
    expect(ptaNotice(two)).toMatch(/^2 offers do not say/);
  });

  it("warns when every offer is one the server suspects is non-PTA", () => {
    const offers = [offer("l1", "mega", 284999, { ptaAssessment: "likely_non_pta" }), offer("l2", "ishopping", 288000, { ptaAssessment: "likely_non_pta" })];
    expect(ptaNotice(offers)).toMatch(/may be non-PTA units/);
  });

  it("has nothing to say for clear or unrelated products", () => {
    expect(ptaNotice([approved("a", "mega", 1), approved("b", "shophive", 2)])).toBeNull();
    expect(ptaNotice([offer("l", "mega", 1, { productCategory: "laptop" })])).toBeNull();
    expect(ptaNotice([])).toBeNull();
    expect(ptaNotice(undefined)).toBeNull();
  });
});

describe("bestDealOffer with PTA", () => {
  it("never picks an offer that does not say it is PTA approved when the server has marked such offers", () => {
    const best = bestDealOffer(mixed());
    expect(best._id).toBe("a"); // "quiet" scores higher (97) but does not say
  });

  it("is unchanged when the server marked nothing", () => {
    const plain = [offer("x", "mega", 100, { dealScore: 99 }), approved("y", "shophive", 120, { dealScore: 80 })];
    expect(bestDealOffer(plain)._id).toBe("x");
  });

  it("falls back to the highest score when no offer is approved", () => {
    const none = [offer("l1", "mega", 284999, { ptaAssessment: "likely_non_pta", dealScore: 60 }), offer("l2", "ishopping", 288000, { ptaAssessment: "likely_non_pta", dealScore: 85 })];
    expect(bestDealOffer(none)._id).toBe("l2");
  });
});

describe("summarizeOffers with PTA", () => {
  it("never calls an offer that may be non-PTA the lowest price or the best deal, but still counts it", () => {
    const summary = summarizeOffers(mixed());
    expect(summary.lowest._id).toBe("a");
    expect(summary.bestDeal._id).toBe("a"); // "quiet" scores 97 but is not comparable
    expect(summary.count).toBe(3);
    expect(summary.average).toBe(Math.round((360000 + 369999 + 389999) / 3));
  });

  it("uses them when nothing else is left", () => {
    const only = [offer("l1", "mega", 284999, { ptaAssessment: "likely_non_pta", dealScore: 60 }), offer("l2", "ishopping", 288000, { ptaAssessment: "likely_non_pta", dealScore: 85 })];
    const summary = summarizeOffers(only);
    expect(summary.lowest._id).toBe("l1");
    expect(summary.bestDeal._id).toBe("l2");
  });
});

describe("PTA on screen", () => {
  it("OfferTable marks each offer, and the best deal is an approved one", () => {
    inRouter(<OfferTable offers={mixed()} name="iPhone 17" />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("PTA not stated")).toBeInTheDocument(); // the cheapest, at 360,000
    expect(rows[0]).not.toHaveTextContent("Best deal");
    expect(rows[0]).not.toHaveTextContent("Lowest price"); // it may be a cheaper non-PTA unit, so it is not held up as the lowest
    expect(within(rows[1]).getByText("PTA approved")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Best deal");
    expect(rows[1]).toHaveTextContent("Lowest price");
    expect(within(rows[2]).getByText("PTA approved")).toBeInTheDocument();
  });

  it("ResultGroup explains what the best deal counts, and leads with the lowest price that compares like with like", () => {
    inRouter(<ResultGroup group={{ productName: "Apple iPhone 17 256GB", offers: mixed() }} />);
    expect(screen.getByRole("note")).toHaveTextContent("1 offer does not say whether the phone is PTA approved");
    expect(document.querySelector(".result-group__amount")).toHaveTextContent("369,999"); // not the 360,000 that does not say
    expect(within(document.querySelector(".result-group__badges")).getByText("PTA approved")).toBeInTheDocument();
    expect(document.querySelector(".result-group__info")).toHaveTextContent("save up to PKR 20,000"); // 389,999 - 369,999
  });

  it("ResultGroup shows no notice for a product with nothing to say", () => {
    inRouter(<ResultGroup group={{ productName: "Apple iPhone 17 256GB", offers: [approved("a", "mega", 369999), approved("b", "shophive", 389999)] }} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("ProductCard carries the label of the offer whose price it shows", () => {
    const { unmount } = inRouter(<ProductCard group={{ productName: "Apple iPhone 17", offers: mixed() }} />);
    expect(screen.getByText("PTA approved")).toBeInTheDocument(); // the card's price is the lowest approved one
    expect(screen.getByText("PKR 369,999")).toBeInTheDocument();
    unmount();

    const suspects = [offer("l1", "mega", 284999, { ptaAssessment: "likely_non_pta" }), offer("l2", "ishopping", 288000, { ptaAssessment: "likely_non_pta" })];
    inRouter(<ProductCard group={{ productName: "Apple iPhone 17", offers: suspects }} />);
    expect(screen.getByText("May be non-PTA")).toHaveAttribute("title", expect.stringMatching(/ask the store/i)); // nothing else to lead with
  });

  it("a laptop shows no PTA label at all", () => {
    inRouter(<ProductCard group={{ productName: "Dell Inspiron", offers: [offer("a", "mega", 100000, { productCategory: "laptop" }), offer("b", "priceoye", 105000, { productCategory: "laptop" })] }} />);
    expect(screen.queryByText(/PTA/)).toBeNull();
  });
});
