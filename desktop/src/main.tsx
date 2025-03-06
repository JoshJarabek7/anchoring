import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./components/settings/theme-provider"; 
import "./App.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="ui-theme">
      <App />
      <Toaster position="top-right" />
    </ThemeProvider>
  </React.StrictMode>,
);
