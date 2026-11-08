// CategoryMenu.jsx — the header's "Categories" menu: every category the site covers, each with its drawing (CategoryIcon), in one
// panel. It replaced three fixed links (Phones, Laptops, TVs) that repeated a few of the home page's tiles and left the rest out.
// A disclosure button (aria-expanded) and a list of links: it opens on click, and closes on a choice, Escape, a click outside, or
// moving to another page. While a category is being browsed the button is marked current and says which.

import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { FEATURED_CATEGORIES, categoryName } from "../lib/categories.js";
import CategoryIcon from "./CategoryIcon.jsx";

export default function CategoryMenu({ current = "" }) {
  const holder = useRef(null);
  const button = useRef(null);
  const panelId = useId();
  const { pathname, search } = useLocation();
  // Open only on the page it was opened on: moving to another page closes it, with no effect to reset it.
  const here = `${pathname}${search}`;
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === here;
  const setOpen = (value) => setOpenOn(typeof value === "function" ? (value(open) ? here : null) : value ? here : null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    const onClick = (event) => {
      if (!holder.current?.contains(event.target)) setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const browsing = FEATURED_CATEGORIES.includes(current) ? current : "";

  return (
    <div className="cat-menu" ref={holder}>
      <button
        ref={button}
        type="button"
        className="cat-menu__button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-current={browsing ? "page" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {browsing ? categoryName(browsing) : "Categories"}
        <span className="cat-menu__chevron" aria-hidden="true" />
      </button>
      <div id={panelId} className="cat-menu__panel" hidden={!open}>
        <ul className="cat-menu__list">
          {FEATURED_CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                to={`/results?category=${category}`}
                className="cat-menu__item"
                aria-current={browsing === category ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="cat-menu__icon"><CategoryIcon category={category} size={22} /></span>
                {categoryName(category)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
