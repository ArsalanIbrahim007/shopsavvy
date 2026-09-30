// SearchBox.jsx — the search field in the header, with suggestions from the listings we hold.
//
// Behaviour: type, pause (200 ms), suggestions appear; Up/Down move through them, Enter
// searches (the highlighted suggestion, or what was typed), Escape closes the list, a
// click outside closes it. It follows the combobox pattern so screen readers announce the
// list. Searching goes to /results?q=..., so the URL is the source of truth.

import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getSuggestions } from "../api/endpoints.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { categoryName } from "../lib/categories.js";
import { addRecentSearch } from "../lib/recentSearches.js";
import "./SearchBox.css";

// The server refuses longer text anyway (400); stopping it here saves a round trip.
const MAX_QUERY_LENGTH = 100;

export default function SearchBox({ initialQuery = "", autoFocus = false, size = "normal" }) {
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef(null);

  const [text, setText] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const typed = text.trim();
  const debounced = useDebouncedValue(typed, 200);
  const suggestionState = useAsync((signal) => getSuggestions(debounced, { limit: 6, signal }), [debounced]);

  // Only show suggestions that belong to what is in the box now, not to an earlier pause.
  const suggestions =
    suggestionState.status === "success" && debounced === typed && typed.length >= 2 ? suggestionState.data : [];
  const showList = open && suggestions.length > 0;

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function search(term) {
    const query = term.trim();
    if (!query) return;
    setOpen(false);
    setActive(-1);
    addRecentSearch(query);
    navigate(`/results?${new URLSearchParams({ q: query }).toString()}`);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    search(showList && active >= 0 ? suggestions[active].text : text);
  }

  return (
    <div className={`searchbox searchbox--${size}`} ref={rootRef}>
      <form role="search" onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor={`${listId}-input`}>Search products</label>
        <input
          id={`${listId}-input`}
          className="searchbox__input"
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Search a phone, laptop, TV…"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button className="searchbox__button" type="submit" aria-label="Search">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      {showList && (
        <ul className="searchbox__list card" id={listId} role="listbox" aria-label="Suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.text}|${suggestion.category}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "searchbox__option is-active" : "searchbox__option"}
              // mousedown, not click: the input must not lose focus (and close the list) before this runs
              onMouseDown={(event) => {
                event.preventDefault();
                setText(suggestion.text);
                search(suggestion.text);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span>{suggestion.text}</span>
              <span className="searchbox__meta">{categoryName(suggestion.category)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
