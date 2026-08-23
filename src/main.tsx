import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/biz-udpgothic/400.css";
import "@fontsource/biz-udpgothic/700.css";
import "@fontsource/biz-udgothic/700.css";
import "@fontsource/klee-one/600.css";
import "./styles/index.css";

import { App } from "./App";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root が見つかりません");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
