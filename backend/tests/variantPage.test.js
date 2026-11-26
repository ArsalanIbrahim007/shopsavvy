// The RAM and storage a store's page sells a phone in, when its title names neither (iShopping's "Samsung Galaxy A17", 2026-11-27).
import { describe, it, expect } from "vitest";

import { listedVariant, memoryVariants, readMemoryLabel } from "../src/services/variantPage.service.js";

// iShopping's A17 page, its swatch renderer's config cut down to what is read
const config = {
  attributes: {
    968: { id: "968", code: "color", label: "Color", options: [
      { id: "9560", label: "Black", products: ["649524", "649525"] },
      { id: "9280", label: "Grey", products: ["649526"] },
    ] },
    1010: { id: "1010", code: "memory_ram", label: "Memory/Ram", options: [
      { id: "9533", label: "128GB - 6GB RAM", products: ["649524", "649526"] },
      { id: "9538", label: "256GB - 8GB RAM", products: ["649525"] },
    ] },
  },
  optionPrices: {
    649524: { finalPrice: { amount: 65999 } },
    649525: { finalPrice: { amount: 78999 } },
    649526: { finalPrice: { amount: 69795 } },
  },
};
const page = `<script type="text/x-magento-init">{"[data-role=swatch-options]": {"Magento_Swatches/js/swatch-renderer": {"jsonConfig": ${JSON.stringify(config)}, "jsonSwatchConfig": {}}}}</script>`;

describe("a phone's memory variants on its store's page", () => {
  it("reads each with its lowest price", () => {
    expect(memoryVariants(page)).toEqual([
      { label: "128GB - 6GB RAM", ramGb: 6, storageGb: 128, price: 65999 },
      { label: "256GB - 8GB RAM", ramGb: 8, storageGb: 256, price: 78999 },
    ]);
  });

  it("names the variant the listing's price is, and none when the price is no variant's", () => {
    const variants = memoryVariants(page);
    expect(listedVariant(variants, 65999)).toMatchObject({ ramGb: 6, storageGb: 128 });
    expect(listedVariant(variants, 78999)).toMatchObject({ ramGb: 8, storageGb: 256 });
    expect(listedVariant(variants, 70000)).toBeNull();
  });

  it("reads the labels stores write", () => {
    expect(readMemoryLabel("128GB - 6GB RAM")).toEqual({ ramGb: 6, storageGb: 128 });
    expect(readMemoryLabel("8GB RAM / 256GB")).toEqual({ ramGb: 8, storageGb: 256 });
    expect(readMemoryLabel("6GB+128GB")).toEqual({ ramGb: 6, storageGb: 128 });
    expect(readMemoryLabel("1TB - 12GB RAM")).toEqual({ ramGb: 12, storageGb: 1024 });
    expect(readMemoryLabel("Black")).toBeNull();
  });

  it("finds nothing on a page without a memory choice", () => {
    expect(memoryVariants("<html>no config</html>")).toEqual([]);
  });
});
