// useSwipe.js — a horizontal swipe on touch screens (and a mouse drag), for the home page's examples and any other carousel.
// A friend tried to swipe the "Caught by our checks" card on a phone and nothing moved (2026-11-19): it only had small dots.
//
// A swipe is a mostly horizontal move of at least SWIPE_MIN_PX; a mostly vertical one is left to the page, so scrolling past the
// card still works. Returns handlers to spread on the element.

import { useRef } from "react";

export const SWIPE_MIN_PX = 40;

/** The direction of a finished gesture: "left", "right" or null (too short, or more vertical than horizontal). */
export function swipeDirection(dx, dy, min = SWIPE_MIN_PX) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return null;
  return dx < 0 ? "left" : "right";
}

/**
 * @param {{onLeft?: Function, onRight?: Function}} handlers  onLeft: swiped left (show the next); onRight: swiped right (previous)
 */
export function useSwipe({ onLeft, onRight }) {
  const start = useRef(null);
  return {
    onPointerDown: (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event) => {
      if (!start.current) return;
      const direction = swipeDirection(event.clientX - start.current.x, event.clientY - start.current.y);
      start.current = null;
      if (direction === "left") onLeft?.();
      if (direction === "right") onRight?.();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
