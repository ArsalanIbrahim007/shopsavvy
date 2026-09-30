import { describe, it, expect } from "vitest";
import { shouldTrigger } from "../src/services/priceAlert.service.js";

describe("shouldTrigger", () => {
  it("triggers when the current price has dropped to the target", () => {
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, 1000)).toBe(true);
  });

  it("triggers when the current price has dropped below the target", () => {
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, 900)).toBe(true);
  });

  it("does not trigger while the price is still above the target", () => {
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, 1001)).toBe(false);
  });

  it("does not trigger an alert that isn't active (unconfirmed, already triggered or cancelled)", () => {
    expect(shouldTrigger({ status: "pending", targetPrice: 1000 }, 900)).toBe(false);
    expect(shouldTrigger({ status: "triggered", targetPrice: 1000 }, 900)).toBe(false);
    expect(shouldTrigger({ status: "cancelled", targetPrice: 1000 }, 900)).toBe(false);
  });

  it("does not trigger on a missing or invalid current price", () => {
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, null)).toBe(false);
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, undefined)).toBe(false);
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, NaN)).toBe(false);
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, 0)).toBe(false);
    expect(shouldTrigger({ status: "active", targetPrice: 1000 }, -50)).toBe(false);
  });
});
