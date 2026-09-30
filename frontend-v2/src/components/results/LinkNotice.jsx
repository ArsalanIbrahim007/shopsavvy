// LinkNotice.jsx — shown above results that began with a link pasted from another site. It says what we did (read the
// product's name from the address, nothing else) and what to keep in mind when comparing with that site: its price is in
// another currency and leaves out shipping and import duty. The shopper can correct the name in the search box.

export default function LinkNotice({ store, query, capacity = null }) {
  // "256GB" or "8GB,256GB": only plain capacities are shown, whatever the address carried
  const capacities = String(capacity ?? "").split(",").filter((value) => /^\d{1,4}(GB|TB)$/i.test(value));
  const where = store ? `your ${store} link` : "the link you pasted";
  return (
    <aside className="link-notice card" aria-label="About this search">
      <p>
        <strong>Pakistani prices for “{query}”</strong>, the product name we read from {where}. We read the name from the address
        only; we did not open the page, so this may not be the exact model, colour or capacity. Not right? Change the search above.
        {capacities.length > 0 && ` Your link mentions ${capacities.join(" and ")}: most Pakistani stores leave the capacity out of the title, so check it on each product.`}
      </p>
      <p className="small muted">
        {store ? `${store}'s price` : "That price"} is in another currency and usually leaves out shipping and import duty (and PTA
        approval for phones), so compare the total you would pay, not the number on the page.
      </p>
    </aside>
  );
}
