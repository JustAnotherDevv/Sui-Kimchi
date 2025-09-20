import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// import { LightNodeProvider } from "@waku/react";

const NODE_OPTIONS = { defaultBootstrap: true };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* <LightNodeProvider options={NODE_OPTIONS}> */}
    <App />
    {/* </LightNodeProvider> */}
  </StrictMode>
);
