import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles/global.css";
import { installWindowControlsInsetListeners } from "./ui/titlebarInset";

installWindowControlsInsetListeners();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

