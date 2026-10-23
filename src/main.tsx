import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/material-icons";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import App from "./App";
import "./styles.css";
import "./theme-app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
