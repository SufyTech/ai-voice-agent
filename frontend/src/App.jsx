/**
 * App.jsx
 *
 * Application root component. Owns the single top-level routing decision:
 * which of the two full-screen views is currently active.
 *
 * Intentionally thin — no data fetching, no context providers, no layout chrome.
 * All real logic lives in LandingPage and VoiceApp respectively.
 *
 * Screen states:
 *   "landing" → LandingPage  (marketing / entry point)
 *   "app"     → VoiceApp     (voice agent interface)
 *
 * Navigation is prop-callback driven rather than using a router library
 * because there are only two screens and no URL-addressable deep links
 * are required. Adding a router later is a straight swap of setScreen calls.
 */

import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import VoiceApp from "./pages/VoiceApp";
import "./styles/globals.css"; // Global reset, design tokens, and base element styles

export default function App() {
  /**
   * screen
   * Single piece of state that drives which full-screen view is rendered.
   * Kept as a string union ("landing" | "app") rather than a boolean so
   * additional screens can be added later without refactoring the shape of state.
   */
  const [screen, setScreen] = useState("landing"); // "landing" | "app"

  /**
   * Ternary render — exactly one screen is mounted at a time.
   * The inactive screen is fully unmounted (not hidden), which means
   * VoiceApp's WebSocket connection and MediaRecorder are torn down
   * automatically when the user navigates back to the landing page.
   *
   * LandingPage receives onEnterApp to trigger the transition to "app".
   * VoiceApp receives onBack to return to "landing".
   */
  return screen === "landing" ? (
    <LandingPage onEnterApp={() => setScreen("app")} />
  ) : (
    <VoiceApp onBack={() => setScreen("landing")} />
  );
}
