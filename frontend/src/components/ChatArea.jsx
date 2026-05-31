/**
 * ChatArea.jsx
 *
 * The main conversation panel of the Voice Agent UI.
 *
 * Responsibilities:
 *  - Renders the full message history (user + assistant turns)
 *  - Shows real-time status (listening / thinking / idle)
 *  - Exposes mic button with three states: idle → recording → processing
 *  - Auto-scrolls to the latest message on every update
 *  - Delegates all audio/state logic upward via props (fully controlled component)
 *
 * Props:
 *  @prop {Array}    messages       - Conversation history: [{ id, role, text, latency, isStreaming }]
 *  @prop {boolean}  isRecording    - True while the mic is capturing audio
 *  @prop {boolean}  isProcessing   - True while waiting for the backend to respond
 *  @prop {Function} onStartRecord  - Callback to begin mic capture
 *  @prop {Function} onStopRecord   - Callback to stop mic capture and send audio
 *  @prop {Function} onInterrupt    - Callback to cancel the current agent response mid-stream
 *  @prop {Function} onReset        - Callback to clear conversation history and reset backend state
 */

import { useRef, useEffect } from "react";
import styles from "./ChatArea.module.css";

export default function ChatArea({
  messages,
  isRecording,
  isProcessing,
  onStartRecord,
  onStopRecord,
  onInterrupt,
  onReset,
}) {
  // Ref attached to an invisible div at the bottom of the message list.
  // Scrolled into view whenever messages array changes, keeping the
  // latest turn always visible without manual scroll management.
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * handleMicClick
   *
   * Single entry point for all mic button interactions.
   * State machine:
   *   processing → interrupt the agent (user wants to speak over it)
   *   recording  → stop capture and dispatch audio to backend
   *   idle       → begin mic capture
   *
   * Keeping this logic here (rather than inline in JSX) makes the
   * state transitions explicit and easy to extend later.
   */
  function handleMicClick() {
    if (isProcessing) {
      onInterrupt();
      return;
    }
    if (isRecording) {
      onStopRecord();
    } else {
      onStartRecord();
    }
  }

  return (
    <div className={styles.area}>
      {/* ── Header ─────────────────────────────────────────────────────────
          Shows the panel title and a live status hint that updates with
          the current recording/processing state. Reset button lives here
          so it's always reachable without scrolling.
      ─────────────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.headerTitle}>Voice Conversation</h2>
          <p className={styles.headerSub}>
            {isRecording
              ? "🔴 Listening — will auto-send when you stop talking"
              : isProcessing
                ? "⏳ Agent is thinking… click mic to interrupt"
                : "Click the mic and speak"}
          </p>
        </div>
        <button className={styles.resetBtn} onClick={onReset}>
          ↺ Reset
        </button>
      </div>

      {/* ── Message list ───────────────────────────────────────────────────
          Scrollable container for all conversation turns.

          Empty state: shown when no messages exist yet — guides the user
          on how to interact without needing a tooltip or onboarding modal.

          Message rendering:
           - role="user"      → right-aligned bubble (see CSS module)
           - role="assistant" → left-aligned bubble
           - isStreaming=true → shows blinking cursor while TTS text streams in
           - latency          → displayed as a small badge per assistant turn,
                                giving developers/recruiters visibility into
                                the pipeline's round-trip performance

          Thinking indicator: rendered as a separate animated bubble while
          isProcessing=true, before the first token of the reply arrives.
      ─────────────────────────────────────────────────────────────────── */}
      <div className={styles.messages}>
        {/* Empty state — only visible before the first message */}
        {messages.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎙️</div>
            <p>Click the mic and speak naturally.</p>
            <p className={styles.emptyHint}>
              It auto-sends after you stop talking. No button needed.
            </p>
          </div>
        )}

        {/* Conversation turns */}
        {messages.map((m) => (
          <div key={m.id} className={`${styles.msg} ${styles[m.role]}`}>
            {/* Turn metadata: speaker label + optional latency badge */}
            <div className={styles.msgMeta}>
              <span className={styles.msgRole}>
                {m.role === "user" ? "You" : "Agent"}
              </span>
              {m.latency && (
                <span className={styles.msgLatency}>{m.latency}ms</span>
              )}
            </div>

            {/* Bubble text — streaming cursor shown while agent reply is still arriving */}
            <div className={styles.msgBubble}>
              {m.text}
              {m.role === "assistant" && m.isStreaming && (
                <span className={styles.cursor}>▌</span>
              )}
            </div>
          </div>
        ))}

        {/* Animated thinking indicator — visible only while awaiting backend response */}
        {isProcessing && (
          <div className={`${styles.msg} ${styles.assistant}`}>
            <div className={styles.msgMeta}>
              <span className={styles.msgRole}>Agent</span>
            </div>
            {/* Three <span> children are targeted by CSS for the bounce animation */}
            <div className={`${styles.msgBubble} ${styles.thinking}`}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {/* Invisible scroll anchor — kept at bottom so new messages always scroll into view */}
        <div ref={bottomRef} />
      </div>

      {/* ── Mic controls ───────────────────────────────────────────────────
          Central call-to-action. The button cycles through three visual
          states driven by CSS class composition:
            default    → idle mic icon, ready to record
            .recording → red pulsing rings, actively capturing audio
            .processing → stop icon, click interrupts the agent

          The two <span> rings (.micRing, .micRing2) are purely decorative —
          CSS animates them as expanding pulse rings during recording to give
          a clear "live" signal without needing an external icon library.
      ─────────────────────────────────────────────────────────────────── */}
      <div className={styles.controls}>
        <button
          className={`${styles.micBtn} ${isRecording ? styles.recording : ""} ${isProcessing ? styles.processing : ""}`}
          onClick={handleMicClick}
        >
          {/* Animated pulse rings — visible only when recording (controlled via CSS) */}
          <span className={styles.micRing} />
          <span className={styles.micRing2} />

          {/* Icon reflects current state: recording / processing / idle */}
          {isRecording ? "🔴" : isProcessing ? "⏹️" : "🎙️"}
        </button>

        {/* Contextual hint below the button — reinforces what clicking will do */}
        <p className={styles.micHint}>
          {isRecording
            ? "Listening… auto-sends on silence"
            : isProcessing
              ? "Click to interrupt agent"
              : "Click to speak"}
        </p>
      </div>
    </div>
  );
}
