// useCountUp.js — a number that counts up to its value, for figures that are the point of a block (the home page's trust row,
// the hero's proof card). With reduced motion, or without animation support, it is simply the value.

import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true; // no way to ask: do not animate
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * [ref, inView]: true once the element has been on screen (and stays true), so a count starts where it is seen, not below the fold.
 * Without IntersectionObserver it is true at once.
 */
export function useInView() {
  const ref = useRef(null);
  const [inView, setInView] = useState(() => typeof window === "undefined" || typeof window.IntersectionObserver !== "function");
  useEffect(() => {
    if (inView || !ref.current) return undefined;
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setInView(true);
    }, { threshold: 0.3 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView]);
  return [ref, inView];
}

/**
 * @returns {number} the value to show now: counts from 0 to `value` over `duration` ms once `start` is true (and again whenever
 * `value` changes). Before it starts it is 0.
 */
export function useCountUp(value, { duration = 900, start = true } = {}) {
  const target = Number.isFinite(value) ? value : 0;
  const animate = target > 0 && !prefersReducedMotion() && typeof window.requestAnimationFrame === "function";
  const [shown, setShown] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate || !start) return undefined;
    let frame;
    const begin = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - begin) / duration);
      setShown(Math.round(target * easeOut(t)));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration, animate, start]);

  return animate ? shown : target;
}
