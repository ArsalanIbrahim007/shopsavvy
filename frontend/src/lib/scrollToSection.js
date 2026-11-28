// scrollToSection.js — glides the page to a section of it (2026-11-29: the header's "Deals" on the home page jumped straight to the
// Verified deals; now it scrolls there, down or up from wherever the reader is). Animated here rather than by the browser's own
// "smooth" scrolling, which some browsers finish in one jump: an ease-in-out of GLIDE_MIN_MS to GLIDE_MAX_MS (longer for a longer
// way), stopped as soon as the reader scrolls, taps or presses a key themselves. Someone who has asked their system for less motion
// gets the jump (prefers-reduced-motion). The section's CSS keeps it clear of the sticky header (scroll-margin-top).

export const GLIDE_MIN_MS = 400;
export const GLIDE_MAX_MS = 800;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** How long a glide of `distance` pixels takes: GLIDE_MIN_MS for a short way, up to GLIDE_MAX_MS from 2,000 px. */
export const glideDuration = (distance) => Math.round(GLIDE_MIN_MS + (GLIDE_MAX_MS - GLIDE_MIN_MS) * Math.min(1, Math.abs(distance) / 2000));

/** The page position that puts the element's top at its scroll-margin-top (below the sticky header). */
function targetTop(target, win) {
  const margin = parseFloat(win.getComputedStyle?.(target).scrollMarginTop) || 0;
  return Math.max(0, Math.round(target.getBoundingClientRect().top + win.scrollY - margin));
}

/** Scrolls to the element with this id; false when the page has no such element (the caller then navigates instead). */
export function scrollToSection(id, { doc = globalThis.document, win = globalThis.window } = {}) {
  const target = doc?.getElementById(id);
  if (!target) return false;
  const reduce = win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  // (a page that is not on screen runs no animation frames: it jumps, rather than wait to glide until it is shown)
  if (reduce || doc.hidden || typeof win?.requestAnimationFrame !== "function") {
    target.scrollIntoView({ behavior: "auto", block: "start" });
    return true;
  }

  const from = win.scrollY;
  const to = targetTop(target, win);
  const distance = to - from;
  if (Math.abs(distance) < 2) return true;
  const duration = glideDuration(distance);

  // the reader taking over stops the glide where it is
  let stopped = false;
  const stop = () => { stopped = true; };
  const events = ["wheel", "touchstart", "keydown", "mousedown"];
  for (const name of events) win.addEventListener(name, stop, { passive: true, once: true });
  const done = () => { for (const name of events) win.removeEventListener(name, stop); };

  let start = null;
  const step = (now) => {
    if (stopped) return done();
    if (start === null) start = now;
    const progress = Math.min(1, (now - start) / duration);
    win.scrollTo(0, Math.round(from + distance * easeInOutCubic(progress)));
    if (progress < 1) win.requestAnimationFrame(step);
    else done();
  };
  win.requestAnimationFrame(step);
  return true;
}
