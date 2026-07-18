import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "./fonts.css";
import "./i18n";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
