import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Home from "./pages/Home.jsx";
import Results from "./pages/Results.jsx";
import Product from "./pages/Product.jsx";
import HowItWorks from "./pages/HowItWorks.jsx";
import NotFound from "./pages/NotFound.jsx";

// Routes: / home, /results?q=|category=, /product/:id, /how-it-works. The outer boundary
// catches a crash in the layout itself; each page is also wrapped inside the layout.
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="results" element={<Results />} />
            <Route path="product/:id" element={<Product />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
