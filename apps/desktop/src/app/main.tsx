import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "../styles/index.css";
import { APP_VERSION } from "../config/version";
import { initializeConfig } from "../config";
import { addLog } from "../services/loggingService";

initializeConfig();

addLog(`App started, version ${APP_VERSION}`);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
