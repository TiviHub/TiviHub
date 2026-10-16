import React from "react";
import { hydrateRoot } from "react-dom/client";
import "@fontsource/material-icons";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto-mono/latin-400.css";
import "./landing.css";
import LandingPage from "./LandingPage";

hydrateRoot(document.getElementById("root")!,
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>,
);
