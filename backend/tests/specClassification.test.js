import { describe, it, expect } from "vitest";
import { extractModelCodes, extractSpecs } from "../src/services/normalizeTitle.service.js";
import { attributeConflict } from "../src/services/similarity.service.js";
import { classifyPairML, mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";

const specsOf = (title) =>
  Object.fromEntries([...extractSpecs(title)].map(([k, v]) => [k, [...v]]));

describe("title token classification", () => {
  it("keeps genuine model codes", () => {
    expect([...extractModelCodes("Samsung 65 QN70F Neo QLED")]).toEqual(["qn70f"]);
    expect([...extractModelCodes("Samsung Watch 8 40mm (R-L320)")]).toEqual(["l320"]);
    expect([...extractModelCodes("Dell 27 Inch 144Hz Monitor S2721DGF")]).toEqual(["s2721dgf"]);
  });

  it("does not count specifications as model codes", () => {
    // Only the model names (A17, V15) survive; every spec is excluded.
    expect([...extractModelCodes("Samsung Galaxy A17 6GB 128GB 5000mAh 50MP 25W")]).toEqual(["a17"]);
    expect([...extractModelCodes("HP EliteBook 840 G8 Core i7 11th Gen")]).toEqual([]);
    expect([...extractModelCodes("Acer Nitro V15 Core i7-13620H RTX 4060")]).toEqual(["v15"]);
  });

  it("recognises three-character model codes, but the classifier feature keeps four", () => {
    expect([...extractModelCodes("Samsung 55 Inch QLED TV (Q7F)")]).toEqual(["q7f"]);
    expect([...extractModelCodes("Lenovo ThinkPad E14 Gen 7")]).toEqual(["e14"]);
    expect([...extractModelCodes("Samsung 55 Inch QLED TV (Q7F)", { minCodeLength: 4 })]).toEqual([]);
  });

  it("classifies unit specs, CPU, GPU and CPU tier", () => {
    expect(specsOf("Samsung Watch 8 44mm")).toEqual({ mm: [44] });
    expect(specsOf("Xiaomi 14 50MP + 12MP 5000mAh")).toEqual({ mp: [50, 12], mah: [5000] });
    expect(specsOf("HP EliteBook Core i7 11th Gen")).toEqual({ cputier: ["7"], gen: [11] });
    expect(specsOf("Lenovo ThinkPad E14 Intel Core Ultra 7 155H")).toEqual({ cputier: ["7"], cpu: ["155h"] });
    expect(specsOf("Acer Nitro V15 Ci7-13620H RTX 5050")).toEqual({ cputier: ["7"], cpu: ["13620h"], gpu: ["rtx5050"] });
  });

  it("treats 1080p as a resolution but 1260p as a CPU", () => {
    expect(specsOf("Samsung 32 Inch 1080p TV")).toMatchObject({ resolution: ["1080p"] });
    expect(specsOf("Dell Latitude Core i7-1260P")).toMatchObject({ cpu: ["1260p"] });
  });

  it("does not read a watch generation as a CPU tier", () => {
    expect(specsOf("Samsung Galaxy Watch Ultra 2 47mm").cputier).toBeUndefined();
  });
});

describe("attribute veto with specs", () => {
  it.each([
    ["Samsung Watch 8 40mm", "Samsung Watch 8 44mm"],
    ["HP EliteBook 840 G8 Core i7 11th Gen", "HP EliteBook 840 G8 Core i7 12th Gen"],
    ["Dell 27 Inch 144Hz Monitor", "Dell 27 Inch 165Hz Monitor"],
    ["Acer Nitro V15 Ci7-13620H (16GB-512GB SSD) RTX 4060", "Acer Nitro V15 Ci7-13620H (16GB-512GB SSD) RTX 5050"],
    ["Lenovo Thinkbook 15 G2 Core i7 (8GB - 1TB)", "Lenovo Thinkbook 15 G2 Core i5 (8GB - 1TB)"],
    ["Lenovo ThinkPad E14 Gen 7 Ultra 5 225U 8GB 512GB", "Lenovo ThinkPad E16 Gen 3 Ultra 5 225U 8GB 512GB"],
    ["Samsung 55 Inch QLED TV (Q7F)", "Samsung 55 Inch QLED TV (Q70T)"],
    ["Samsung Galaxy S24 Ultra 12GB 256GB", "Samsung Galaxy S25 Ultra 12GB 256GB"],
  ])("separates %s / %s", (a, b) => {
    expect(attributeConflict(a, b)).toBe(true);
  });

  it.each([
    // An extra model code or spec on one side proves nothing either way.
    ["Samsung Watch 8 40mm (R-L320)", "Samsung Watch 8 40mm"],
    ["Samsung Galaxy A17 6GB 128GB 5000mAh 50MP", "Samsung Galaxy A17 6GB 128GB"],
    // One store listing more values for the same kind of spec.
    ["Xiaomi 14 50MP + 12MP 5000mAh", "Xiaomi 14 50MP 5000mAh"],
    // A store appending a SKU to a shared model code.
    ["Samsung Galaxy S24 Ultra (SM-S928B) 12GB 256GB", "Samsung Galaxy S24 Ultra 12GB 256GB"],
    // A regional SKU suffix on the same model code.
    ["Samsung Galaxy Watch 7 44mm L310", "Samsung Galaxy Watch 7 44mm L310F"],
  ])("does not veto %s / %s", (a, b) => {
    expect(attributeConflict(a, b)).toBe(false);
  });

  it("treats model codes differing in digits as different models", () => {
    // SM-L500 is the Bluetooth Watch 8 Classic, SM-L505 the LTE one.
    expect(attributeConflict("Samsung Watch 8 Classic 46mm L500", "Samsung Watch 8 Classic 46mm L505")).toBe(true);
  });
});

describe("grouping: a vague listing cannot bridge conflicting ones", () => {
  it("keeps NON PTA and PTA units apart even when a title silent on PTA matches both", () => {
    // Reproduces the live case: the group's representative stated storage but
    // not PTA status, so both units matched it and were compared as one product.
    const groups = groupListingsByProduct(
      [
        { _id: "bare", platform: "priceoye", title: "Samsung Galaxy S25 Ultra (12GB-256GB)", price: 332999 },
        { _id: "non", platform: "mega", title: "Samsung Galaxy S25 Ultra 12GB 256GB Non PTA", price: 244999 },
        { _id: "pta", platform: "mega", title: "Samsung Galaxy S25 Ultra 12GB 256GB PTA Approved", price: 342999 },
      ],
      { matchStrategy: mlMatchStrategy }
    );
    const groupOf = (id) => groups.findIndex((g) => g.offers.some((o) => o._id === id));
    expect(groupOf("non")).not.toBe(groupOf("pta"));
  });
});

describe("trained matcher on the pairs that motivated the fix", () => {
  it("groups the same watch across stores despite an appended model code", () => {
    expect(classifyPairML({ title: "Samsung Watch 8 40mm (R-L320)", price: 63600 }, { title: "Samsung Watch 8 40mm", price: 64999 }).isMatch).toBe(true);
    expect(classifyPairML({ title: "Samsung Watch 8 Classic 46mm (SM-L500)", price: 76850 }, { title: "Samsung Watch 8 Classic 46mm", price: 76599 }).isMatch).toBe(true);
  });

  it("no longer merges different watch generations that share a case size", () => {
    expect(classifyPairML({ title: "Samsung Galaxy Watch 7 44mm", price: 47999 }, { title: "Samsung Galaxy Watch 8 44mm", price: 64499 }).isMatch).toBe(false);
  });

  it("no longer merges different laptops that share a CPU", () => {
    const ideapad = { title: "Lenovo Ideapad Slim 5 14\" Intel Core Ultra 7 155H 16GB 512GB SSD", price: 278999 };
    const thinkpad = { title: "LENOVO THINKPAD E14 G6 14TH Intel Core Ultra 7 155H (16GB-512GB SSD)", price: 329999 };
    expect(classifyPairML(ideapad, thinkpad).isMatch).toBe(false);
  });
});
