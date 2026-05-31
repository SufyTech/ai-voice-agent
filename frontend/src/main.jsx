/**
 * main.jsx
 *
 * Application entry point — the first file executed by the Vite bundler.
 * Mounts the React component tree into the static HTML shell (index.html).
 *
 * Responsibilities:
 *   1. Locate the DOM mount point (#root in index.html)
 *   2. Create a React 18 concurrent-mode root via createRoot
 *   3. Render the top-level <App /> component wrapped in <StrictMode>
 *
 * Nothing else belongs here — imports, providers, and global styles
 * are handled inside App.jsx to keep the entry point minimal.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/**
 * createRoot (React 18+)
 * Replaces the legacy ReactDOM.render API and enables concurrent features
 * (automatic batching, transitions, Suspense improvements).
 * document.getElementById("root") targets the <div id="root"> in index.html —
 * if that element is missing the call throws immediately, making misconfiguration
 * easy to catch during development.
 */
createRoot(document.getElementById("root")).render(
  /**
   * StrictMode
   * Development-only wrapper — has zero effect in production builds.
   * In development it:
   *   - Double-invokes render functions and effects to surface side-effect bugs
   *   - Warns on usage of deprecated React APIs
   *   - Detects unexpected state mutations
   * The double-invoke behaviour is intentional and expected; it is not a bug.
   */
  <StrictMode>
    <App />
  </StrictMode>,
);
