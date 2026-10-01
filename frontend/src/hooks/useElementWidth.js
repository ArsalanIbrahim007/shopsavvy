// useElementWidth.js — the width of an element, kept up to date as it is resized, so a chart can be drawn at the width it is shown at
// (its text then stays a readable size on a phone). Before the first measurement, and where nothing can be measured (tests, no
// ResizeObserver), it is `fallback`.

import { useEffect, useState } from "react";

export const MIN_WIDTH = 280;

export function useElementWidth(ref, fallback = 720) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const measured = Math.round(element.clientWidth);
      if (measured > 0) setWidth(Math.max(measured, MIN_WIDTH));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
