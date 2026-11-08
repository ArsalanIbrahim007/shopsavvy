// ThemeToggle.jsx — one button in the header that cycles the colour theme: dark -> light -> device.
// The icon shows the current choice; the label says what it is and what a click does, so it reads the
// same to a screen reader.

import { useTheme } from "../hooks/useTheme.js";
import { nextTheme } from "../lib/theme.js";

const NAMES = { system: "Device setting", light: "Light", dark: "Dark" };

function Icon({ theme }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false" };
  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  // "Follow my device": a circle half light, half dark (a monitor here read as "TVs" beside the menu)
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, cycle } = useTheme();
  const label = `Colour theme: ${NAMES[theme]}. Switch to ${NAMES[nextTheme(theme)]}.`;

  return (
    <button type="button" className="theme-toggle" onClick={cycle} aria-label={label} title={label}>
      <Icon theme={theme} />
    </button>
  );
}
