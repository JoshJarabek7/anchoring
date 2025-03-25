import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App.tsx";
import { Toaster } from "./components/ui/sonner";

// Create the root and render the app
// We keep StrictMode in development for good practices, but handle the double-mount in our app code
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <>
    <App />
    <Toaster position="top-right" richColors />
  </>
);
