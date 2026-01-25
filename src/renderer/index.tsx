import React from "react";
import { createRoot } from "react-dom/client";
import { ShellLayout } from "./shell.js";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

const root = createRoot(rootElement);
root.render(<ShellLayout />);
