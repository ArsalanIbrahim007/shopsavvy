// useTheme.js — the current theme choice and a way to move to the next one. Applies and remembers it.

import { useCallback, useEffect, useState } from "react";

import { applyTheme, getStoredTheme, nextTheme, storeTheme } from "../lib/theme.js";

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const cycle = useCallback(() => setTheme(nextTheme), []);

  return { theme, cycle };
}
