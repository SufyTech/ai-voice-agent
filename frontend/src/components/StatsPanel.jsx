/**
 * StatsPanel.jsx
 *
 * Right-hand live metrics panel for the Voice Agent app.
 *
 * Responsibilities:
 *  - Displays real-time session statistics (latency, turns, tokens, interrupts)
 *  - Renders progress gauges showing usage relative to defined maximums
 *  - Shows a sparkline bar chart of the last 12 latency readings
 *  - Lists all active backend endpoints as a quick reference
 *  - Tracks and displays session uptime via a local interval timer
 *
 * Architecture notes:
 *  - uptime is the only local state — everything else comes from the `stats`
 *    prop, keeping this component easy to test and reason about
 *  - The Gauge sub-component is co-located here (not extracted to its own file)
 *    because it is only ever used by StatsPanel and has no standalone value
 *
 * Props:
 *  @prop {Object}   stats              - Live session data object
 *  @prop {number[]} stats.latencies    - Array of round-trip times in ms (full history)
 *  @prop {number}   stats.turns        - Total conversation turns this session
 *  @prop {number}   stats.tokens       - Cumulative tokens used this session
 *  @prop {number}   stats.interrupts   - Number of times the user interrupted the agent
 */

import { useEffect, useState } from "react";
import styles from "./StatsPanel.module.css";

/**
 * Gauge
 *
 * A labelled horizontal progress bar showing a value relative to a maximum.
 * Kept as a local sub-component — extracted from StatsPanel's render to
 * avoid repetition, but not worth a separate file since it has no other consumers.
 *
 * @param {string} label  - Display label shown above the bar (left side)
 * @param {number} value  - Current value to display and fill the bar to
 * @param {number} max    - Maximum value (maps to 100% bar width)
 * @param {string} unit   - Unit suffix appended to the value (e.g. "ms", "")
 * @param {string} color  - CSS colour string applied to the fill and value text
 */
function Gauge({ label, value, max, unit, color }) {
  // Clamp to 100% so the bar never overflows its track, even if value exceeds max
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div className={styles.gauge}>
      <div className={styles.gaugeHead}>
        <span className={styles.gaugeLabel}>{label}</span>
        <span className={styles.gaugeValue} style={{ color }}>
          {value}
          {unit}
        </span>
      </div>
      {/* Track is the full-width background; fill grows left-to-right based on pct */}
      <div className={styles.gaugeTrack}>
        <div
          className={styles.gaugeFill}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function StatsPanel({ stats }) {
  // uptime counts seconds elapsed since the component mounted (i.e. session start).
  // Isolated to local state because it is UI-only and doesn't need to live in
  // the parent — clearing the panel resets it automatically on remount.
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setUptime((u) => u + 1), 1000);
    // Cleanup on unmount prevents the interval from running after the panel closes
    return () => clearInterval(t);
  }, []); // Empty dep array — timer starts once on mount, never restarts

  /**
   * fmtTime
   * Converts a raw second count into MM:SS display format.
   * padStart ensures single-digit values always render as two digits (e.g. "03:07").
   */
  const fmtTime = (s) => {
    const m = Math.floor(s / 60),
      sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  /**
   * avgLatency
   * Mean of all recorded round-trip times for this session.
   * Computed fresh on every render — no need to memorise since the
   * latencies array is typically short (< 50 entries per session).
   * Falls back to 0 when no data exists to avoid a divide-by-zero.
   */
  const avgLatency = stats.latencies.length
    ? Math.round(
        stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length,
      )
    : 0;

  return (
    <aside className={styles.panel}>
      {/* ── Panel header ───────────────────────────────────────────────────────
          Title on the left, session uptime clock on the right.
          Uptime ticks every second via the local interval above.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Live Stats</span>
        <span className={styles.uptime}>{fmtTime(uptime)}</span>
      </div>

      {/* ── Key metric cards ───────────────────────────────────────────────────
          Four at-a-glance numbers in a 2×2 grid.
          Each uses a distinct colour token so metrics are scannable
          without reading the label:
            green  (--accent)  → latency  (performance signal)
            purple (--purple)  → turns    (engagement signal)
            amber  (--warn)    → tokens   (cost/usage signal)
            live   (--live)    → interrupts (interaction quality signal)

          avgLatency displays "—" with no unit when no data exists yet,
          avoiding a confusing "0ms" on session start.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <span className={styles.metricVal} style={{ color: "var(--accent)" }}>
            {avgLatency || "—"}
            <span className={styles.metricUnit}>{avgLatency ? "ms" : ""}</span>
          </span>
          <span className={styles.metricLabel}>Avg Latency</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricVal} style={{ color: "var(--purple)" }}>
            {stats.turns}
          </span>
          <span className={styles.metricLabel}>Turns</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricVal} style={{ color: "var(--warn)" }}>
            {stats.tokens}
          </span>
          <span className={styles.metricLabel}>Tokens</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricVal} style={{ color: "var(--live)" }}>
            {stats.interrupts}
          </span>
          <span className={styles.metricLabel}>Interrupts</span>
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── Progress gauges ────────────────────────────────────────────────────
          Three Gauge instances showing usage relative to practical maximums:
            Latency  → max 800ms  (anything above is noticeably slow)
            Tokens   → max 4000   (typical context window budget)
            Turns    → max 20     (reasonable session length for a demo)
          Colour matches the metric card above for visual consistency.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.gauges}>
        <Gauge
          label="Latency"
          value={avgLatency}
          max={800}
          unit="ms"
          color="var(--accent)"
        />
        <Gauge
          label="Tokens used"
          value={stats.tokens}
          max={4000}
          unit=""
          color="var(--purple)"
        />
        <Gauge
          label="Turns"
          value={stats.turns}
          max={20}
          unit=""
          color="var(--warn)"
        />
      </div>

      <div className={styles.divider} />

      {/* ── Latency sparkline ──────────────────────────────────────────────────
          Bar chart of the last 12 latency readings (older values dropped).
          Bar height = (latency / 800ms) * 100%, clamped to 100%.
          Bar colour uses a traffic-light system to convey quality at a glance:
            green  < 300ms  → fast (within target)
            amber  < 600ms  → acceptable (borderline)
            red    ≥ 600ms  → slow (worth investigating)
          "No data yet" placeholder avoids an empty chart on session start.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.chartSection}>
        <span className={styles.chartLabel}>LATENCY HISTORY</span>
        <div className={styles.sparkline}>
          {stats.latencies.length === 0 ? (
            <span className={styles.noData}>No data yet</span>
          ) : (
            stats.latencies.slice(-12).map((l, i) => (
              <div
                key={i}
                className={styles.bar}
                style={{
                  height: `${Math.min((l / 800) * 100, 100)}%`,
                  // Traffic-light colouring based on latency thresholds
                  background:
                    l < 300
                      ? "var(--accent)"
                      : l < 600
                        ? "var(--warn)"
                        : "var(--err)",
                }}
                title={`${l}ms`} /* Native tooltip on hover for exact value */
              />
            ))
          )}
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── Endpoint reference list ────────────────────────────────────────────
          Quick-reference of all backend routes consumed by this frontend.
          Useful during demos and interviews to show backend awareness.
          Each endpoint gets a green dot — all shown as "live" since the
          app wouldn't function if any were unreachable.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.endpointSection}>
        <span className={styles.chartLabel}>ENDPOINTS</span>
        <div className={styles.endpoints}>
          {["/voice", "/interrupt", "/reset", "/configure", "/status"].map(
            (e) => (
              <div key={e} className={styles.endpoint}>
                <span className={styles.endpointDot} />
                <span className={styles.endpointPath}>{e}</span>
              </div>
            ),
          )}
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── Panel footer ───────────────────────────────────────────────────────
          Tech stack badges — subtle credentialing that surfaces the
          underlying services to any developer reviewing the UI.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.panelFooter}>
        <span className={styles.footerLabel}>BUILT WITH</span>
        <div className={styles.techBadges}>
          {["Deepgram", "Groq", "FastAPI"].map((t) => (
            <span key={t} className={styles.badge}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
