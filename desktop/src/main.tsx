import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App.tsx";
import { Toaster } from "./components/ui/sonner";

// Initialize theme from local storage or system preference
const initializeTheme = () => {
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (savedTheme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    // Check system preference
    const isSystemDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    if (isSystemDark) {
      document.documentElement.classList.add("dark");
    }
  }
};

// Run theme initialization before rendering
initializeTheme();

// Create the root and render the app
// We keep StrictMode in development for good practices, but handle the double-mount in our app code
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // return (
  <React.StrictMode>
    <>
      <App />
      <Toaster position="top-right" richColors />
    </>
  </React.StrictMode>
  // );
);
