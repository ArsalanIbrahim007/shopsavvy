// Skeleton.jsx — grey placeholder shapes shown while data loads, so the page does not jump
// when it arrives. Decorative: hidden from screen readers (the region that loads announces
// itself with aria-busy).

export function Skeleton({ width = "100%", height = 16, style }) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, ...style }} />;
}

/** A card-shaped placeholder the size of a DealCard / ProductCard. */
export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true" style={{ padding: "var(--space-4)", display: "grid", gap: "var(--space-3)" }}>
      <Skeleton height={140} />
      <Skeleton width="80%" height={18} />
      <Skeleton width="45%" height={14} />
      <Skeleton width="60%" height={22} />
    </div>
  );
}
