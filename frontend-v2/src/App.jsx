import { BrowserRouter, Routes, Route } from "react-router-dom";
import FoundationCheck from "./pages/FoundationCheck.jsx";

// Placeholder shell. The real pages (Home, Results, Product) are built once the
// design direction is agreed; until then this page proves the data layer works
// against the live backend.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<FoundationCheck />} />
      </Routes>
    </BrowserRouter>
  );
}
