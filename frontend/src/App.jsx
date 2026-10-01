import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Home from "./pages/Home.jsx";
import { Skeleton } from "./components/Skeleton.jsx";
import NotFound from "./pages/NotFound.jsx";

// The home page is what most visits start on, so it ships with the app; the other pages load when first visited,
// which keeps the first download small.
const Results = lazy(() => import("./pages/Results.jsx"));
const Product = lazy(() => import("./pages/Product.jsx"));
const HowItWorks = lazy(() => import("./pages/HowItWorks.jsx"));
const HonestPrices = lazy(() => import("./pages/HonestPrices.jsx"));

function Loading() {
  return (
    <div className="container page-tall" style={{ paddingBlock: "var(--space-6)" }} aria-busy="true">
      <Skeleton height={28} width="40%" />
      <Skeleton height={260} />
    </div>
  );
}

// Routes: / home, /results?q=|category=, /product/:id, /how-it-works, /honest-prices. The outer boundary
// catches a crash in the layout itself; each page is also wrapped inside the layout.
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="results" element={<Suspense fallback={<Loading />}><Results /></Suspense>} />
            <Route path="product/:id" element={<Suspense fallback={<Loading />}><Product /></Suspense>} />
            <Route path="how-it-works" element={<Suspense fallback={<Loading />}><HowItWorks /></Suspense>} />
            <Route path="honest-prices" element={<Suspense fallback={<Loading />}><HonestPrices /></Suspense>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
