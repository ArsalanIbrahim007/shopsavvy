// useDebouncedValue.js — a value that follows another one after it has stopped changing
// for `delayMs`. Used so the search box asks for suggestions once the shopper pauses,
// not on every keystroke.

import { useEffect, useState } from "react";

export function useDebouncedValue(value, delayMs = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
