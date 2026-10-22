import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/material-icons";
import "@fontsource/roboto-mono/latin-400.css";
import "@fontsource/roboto-mono/latin-500.css";
import "@fontsource/roboto-mono/latin-700.css";
import "./landing.css";
import LandingPage from "./LandingPage";

const root = document.getElementById("root")!;
const page = (
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>
);

// Dev serves an empty #root; only the prerendered build has markup to hydrate.
if (root.hasChildNodes()) hydrateRoot(root, page);
else createRoot(root).render(page);
