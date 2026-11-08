// useCountUp.js — a number that counts up to its value once, for figures that are the point of a block (the home page's
// trust row, the hero's proof card). Without animation support or with reduced motion it is simply the value.

import { useEffect, useState } from "react";

export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true; // no way to ask: do not animate
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const easeOut = (t) => 1 - (1 - t) ** 3;

/** @returns {number} the value to show now: counts from 0 to `value` over `duration` ms whenever `value` changes */
export function useCountUp(value, { duration = 900 } = {}) {
  const target = Number.isFinite(value) ? value : 0;
  const animate = target > 0 && !prefersReducedMotion() && typeof window.requestAnimationFrame === "function";
  const [shown, setShown] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate) return undefined;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(target * easeOut(t)));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration, animate]);

  return animate ? shown : target;
}
