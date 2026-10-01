import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount anything a test rendered, so tests cannot affect each other.
afterEach(() => cleanup());

// jsdom has no PointerEvent, so a simulated pointer event would lose its position and pointer type.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  };
}
