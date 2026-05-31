/**
 * VoiceApp.jsx
 *
 * Root application shell for the Voice Agent interface.
 * Owns top-level layout (Sidebar | main content | StatsPanel) and acts as
 * the single source of truth for:
 *   - Which AI persona is active (passed down to useVoiceAgent + Sidebar)
 *   - Which tab is currently selected (voice / analytics / transcripts / settings)
 *   - Whether the viewport is mobile-sized (drives conditional StatsPanel render)
 *
 * All real-time voice state (recording, processing, messages, stats) is
 * encapsulated in the useVoiceAgent hook and destructured here so child
 * components receive only the props they need.
 *
 * Props:
 *   onBack {Function} — callback invoked when the user taps "← Back",
 *                       typically navigates back to the landing page.
 */

import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";
import StatsPanel from "../components/StatsPanel";
import { useVoiceAgent } from "../hooks/useVoiceAgent";
import styles from "./VoiceApp.module.css";

export default function VoiceApp({ onBack }) {
  // ─── Local UI state ──────────────────────────────────────────────────────

  // Active persona key — forwarded to useVoiceAgent to reconfigure the
  // system prompt / voice whenever the user switches in the Sidebar.
  const [persona, setPersona] = useState("assistant");

  // Controls which tab panel is rendered in <main>:
  //   "voice"       → ChatArea (default, real-time conversation)
  //   "analytics"   → latency metrics + bar chart
  //   "transcripts" → full message history
  //   "settings"    → read-only configuration overview
  const [activeTab, setActiveTab] = useState("voice");

  // Tracks whether the viewport is ≤768px so StatsPanel can be hidden on
  // mobile (it's too cramped to be useful at that width).
  // Initialized eagerly from window.innerWidth to avoid a layout flash.
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // ─── Voice agent hook ────────────────────────────────────────────────────
  // Destructure all real-time voice state and control functions from the
  // custom hook. Keeping this logic in a hook means VoiceApp stays a
  // pure orchestration layer rather than housing WebSocket / MediaRecorder logic.
  const {
    messages, // Message[]  — full conversation history for this session
    isRecording, // boolean    — true while the microphone is actively capturing
    isProcessing, // boolean    — true while STT / LLM / TTS pipeline is running
    connected, // boolean    — WebSocket connection status (shown in Sidebar)
    stats, // object     — { latencies[], turns, tokens, interrupts }
    startRecording, // () => void — opens mic and begins streaming audio
    stopRecording, // () => void — closes mic and flushes the audio buffer
    interrupt, // () => void — aborts the current agent response mid-stream
    reset, // () => void — clears messages and resets session state
    configurePersona, // (key: string) => void — pushes persona change to backend
  } = useVoiceAgent();

  // ─── Effects ─────────────────────────────────────────────────────────────

  /**
   * Re-configure the voice agent whenever the persona selection changes.
   * Runs on mount (with the default "assistant" value) and on every
   * subsequent persona change so the backend stays in sync.
   */
  useEffect(() => {
    configurePersona(persona);
  }, [persona]);

  /**
   * Keep isMobile in sync with the viewport width.
   * Attaches a resize listener on mount and cleans it up on unmount
   * to avoid memory leaks if the component is conditionally rendered.
   */
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Tab renderer ────────────────────────────────────────────────────────
  /**
   * renderMain()
   *
   * Switch-based renderer that returns the correct panel for the active tab.
   * Kept as a function (rather than a component map) so it has direct access
   * to all hook state without prop-drilling through an extra component layer.
   *
   * "voice" (default) delegates entirely to <ChatArea> which owns the
   * recording UI and message bubbles.
   *
   * All other tabs are rendered inline here because they are thin
   * display-only views that don't warrant their own component files.
   */
  function renderMain() {
    switch (activeTab) {
      // ── Analytics tab ─────────────────────────────────────────────────
      // Computes summary metrics from stats.latencies on every render —
      // no memoization needed because the dataset is small (one value per turn).
      // Bar chart heights are clamped to 100% and color-coded:
      //   green (< 400ms) → amber (< 700ms) → red (≥ 700ms)
      case "analytics":
        return (
          <div className={styles.tabPage}>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>Analytics</h2>
              <p className={styles.tabSub}>Session performance metrics</p>
            </div>
            <div className={styles.metricsGrid}>
              {[
                {
                  label: "Avg Latency",
                  // Average of all recorded latency samples; falls back to "—" until
                  // at least one turn has completed.
                  val: stats.latencies.length
                    ? Math.round(
                        stats.latencies.reduce((a, b) => a + b, 0) /
                          stats.latencies.length,
                      ) + "ms"
                    : "—",
                  color: "var(--accent)",
                },
                {
                  label: "Best Latency",
                  val: stats.latencies.length
                    ? Math.min(...stats.latencies) + "ms"
                    : "—",
                  color: "var(--accent)",
                },
                {
                  label: "Worst Latency",
                  // Highlighted in error color to make performance outliers immediately visible.
                  val: stats.latencies.length
                    ? Math.max(...stats.latencies) + "ms"
                    : "—",
                  color: "var(--err)",
                },
                {
                  label: "Total Turns",
                  val: stats.turns,
                  color: "var(--purple)",
                },
                {
                  label: "Tokens Used",
                  val: stats.tokens,
                  color: "var(--warn)",
                },
                {
                  label: "Interrupts",
                  // Interrupt count in error color signals user-perceived latency problems.
                  val: stats.interrupts,
                  color: "var(--err)",
                },
              ].map((m) => (
                <div key={m.label} className={styles.metCard}>
                  <span className={styles.metVal} style={{ color: m.color }}>
                    {m.val}
                  </span>
                  <span className={styles.metLabel}>{m.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.chartSection}>
              <div className={styles.chartLabel}>LATENCY HISTORY</div>
              <div className={styles.chart}>
                {stats.latencies.length === 0 ? (
                  // Empty state — shown until the first conversation turn completes.
                  <div className={styles.noData}>
                    No data yet — start a conversation
                  </div>
                ) : (
                  stats.latencies.map((l, i) => (
                    <div key={i} className={styles.barWrap}>
                      <div
                        className={styles.bar}
                        style={{
                          // Bar height is proportional to latency with 800ms as the
                          // visual ceiling — anything at or above 800ms renders at 100%.
                          height: `${Math.min((l / 800) * 100, 100)}%`,
                          // Color thresholds mirror the metric card colors above:
                          // <400ms = good (accent), 400–699ms = warn, ≥700ms = error.
                          background:
                            l < 400
                              ? "var(--accent)"
                              : l < 700
                                ? "var(--warn)"
                                : "var(--err)",
                        }}
                        title={`${l}ms`}
                      />
                      <span className={styles.barLabel}>{l}ms</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      // ── Transcripts tab ───────────────────────────────────────────────
      // Renders the full messages array as a styled conversation log.
      // The dynamic CSS class (tx_user / tx_assistant) drives per-role
      // alignment and color via the stylesheet.
      case "transcripts":
        return (
          <div className={styles.tabPage}>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>Transcripts</h2>
              <p className={styles.tabSub}>Full conversation history</p>
            </div>
            {messages.length === 0 ? (
              // Empty state — directs the user to the Voice tab to start a session.
              <div className={styles.emptyTab}>
                No conversation yet — go to Voice Agent and start talking.
              </div>
            ) : (
              <div className={styles.transcriptList}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    // Combines base txRow style with a role-specific modifier class
                    // (tx_user or tx_assistant) for per-side alignment and styling.
                    className={`${styles.txRow} ${styles["tx_" + m.role]}`}
                  >
                    <div className={styles.txMeta}>
                      <span className={styles.txRole}>
                        {/* Display friendly labels rather than raw role keys */}
                        {m.role === "user" ? "You" : "Agent"}
                      </span>
                      {/* Latency is only present on assistant messages — the time
                          from end-of-user-speech to first-token delivery. */}
                      {m.latency && (
                        <span className={styles.txLatency}>{m.latency}ms</span>
                      )}
                    </div>
                    <div className={styles.txText}>{m.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      // ── Settings tab ──────────────────────────────────────────────────
      // Read-only display of the current agent configuration.
      // Values are hardcoded / derived from local state — this is intentionally
      // not an editable form; configuration changes require backend env vars.
      case "settings":
        return (
          <div className={styles.tabPage}>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>Settings</h2>
              <p className={styles.tabSub}>Your voice agent configuration</p>
            </div>
            <div className={styles.settingsList}>
              {[
                {
                  name: "Backend URL",
                  desc: "FastAPI server",
                  val: "localhost:8000",
                },
                {
                  name: "STT Model",
                  desc: "Deepgram speech-to-text",
                  val: "nova-2",
                },
                {
                  name: "LLM Model",
                  desc: "Groq inference engine",
                  val: "llama-3.1-8b-instant",
                },
                {
                  name: "TTS Model",
                  desc: "Deepgram text-to-speech",
                  val: "aura-asteria-en",
                },
                {
                  name: "Active Persona",
                  desc: "Current AI personality",
                  // Pulled from local state so it reflects the user's live selection.
                  val: persona,
                },
              ].map((s) => (
                <div key={s.name} className={styles.settingRow}>
                  <div>
                    <div className={styles.settingName}>{s.name}</div>
                    <div className={styles.settingDesc}>{s.desc}</div>
                  </div>
                  {/* <code> tag gives configuration values a monospace appearance
                      to visually distinguish them from descriptive labels. */}
                  <code className={styles.settingVal}>{s.val}</code>
                </div>
              ))}
            </div>
          </div>
        );

      // ── Voice tab (default) ───────────────────────────────────────────
      // Falls through to ChatArea for any unrecognized tab key as well,
      // ensuring the UI never renders blank on a bad activeTab value.
      default:
        return (
          <ChatArea
            messages={messages}
            isRecording={isRecording}
            isProcessing={isProcessing}
            onStartRecord={startRecording}
            onStopRecord={stopRecording}
            onInterrupt={interrupt}
            onReset={reset}
          />
        );
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* Back button — exits the voice app and returns to the landing page */}
      <button className={styles.backBtn} onClick={onBack}>
        ← Back
      </button>

      {/* Sidebar owns persona selection and tab navigation */}
      <Sidebar
        persona={persona}
        setPersona={setPersona}
        connected={connected}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main content area — renders the active tab panel via renderMain() */}
      <main className={styles.main}>{renderMain()}</main>

      {/* StatsPanel is hidden on mobile — the narrow viewport makes it unusable.
          isMobile is kept in state (not a CSS media query) so React controls
          mounting/unmounting rather than just visibility. */}
      {!isMobile && <StatsPanel stats={stats} />}
    </div>
  );
}
