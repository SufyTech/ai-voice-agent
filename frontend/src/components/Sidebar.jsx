/**
 * Sidebar.jsx
 *
 * Left navigation panel of the Voice Agent app.
 *
 * Responsibilities:
 *  - Displays the product logo and live backend connection status
 *  - Renders the primary navigation tabs (Voice Agent, Analytics, etc.)
 *  - Provides the persona switcher so users can change the AI's behaviour
 *  - Shows a footer with build context and GitHub link
 *
 * This is a fully controlled, stateless component — it owns no state itself.
 * All selections are lifted to the parent via props, keeping this component
 * pure and trivial to test or reuse.
 *
 * Props:
 *  @prop {string}   persona      - ID of the currently active persona
 *  @prop {Function} setPersona   - Callback to update the active persona
 *  @prop {boolean}  connected    - Whether the FastAPI backend is reachable
 *  @prop {string}   activeTab    - ID of the currently active nav tab
 *  @prop {Function} setActiveTab - Callback to switch the active tab
 */

import styles from "./Sidebar.module.css";

/**
 * PERSONAS
 *
 * Defines the four AI personality presets available to the user.
 * Each persona maps to a different system prompt sent to the LLM via
 * POST /configure on the backend.
 *
 * Adding a new persona: append an entry here — no other file needs changing.
 */
const PERSONAS = [
  {
    id: "assistant",
    label: "Assistant",
    icon: "🤖",
    desc: "Helpful & balanced",
  },
  {
    id: "coach",
    label: "Life Coach",
    icon: "🧠",
    desc: "Motivational & direct",
  },
  { id: "dev", label: "Senior Dev", icon: "💻", desc: "Technical & precise" },
  {
    id: "creative",
    label: "Creative",
    icon: "🎨",
    desc: "Imaginative & playful",
  },
];

/**
 * NAV
 *
 * Top-level navigation items rendered in the sidebar.
 * id values are used as the activeTab key — they must match
 * whatever the parent component uses to conditionally render panels.
 */
const NAV = [
  { id: "voice", icon: "🎙️", label: "Voice Agent" },
  { id: "analytics", icon: "📊", label: "Analytics" },
  { id: "transcripts", icon: "📝", label: "Transcripts" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

export default function Sidebar({
  persona,
  setPersona,
  connected,
  activeTab,
  setActiveTab,
}) {
  return (
    <aside className={styles.sidebar}>
      {/* ── Logo ─────────────────────────────────────────────────────────────
          Brand mark — the animated logoDot is styled in CSS to pulse,
          giving the product a "live system" feel without extra JS.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.logo}>
        <div className={styles.logoDot} />
        <span>VoiceAgent</span>
      </div>

      {/* ── Connection status badge ───────────────────────────────────────────
          Reflects the result of GET /status polled by the parent on mount.
          Switches between .live and .offline CSS classes for green / red styling.
          Keeps developers and demo viewers immediately aware of backend health
          without needing to open DevTools.
      ──────────────────────────────────────────────────────────────────── */}
      <div
        className={`${styles.statusBadge} ${connected ? styles.live : styles.offline}`}
      >
        <span className={styles.statusDot} />
        {connected ? "Backend connected" : "Not connected"}
      </div>

      {/* ── Primary navigation ────────────────────────────────────────────────
          Iterates over the NAV array to keep the markup DRY.
          Active tab gets the .navActive class for highlighted styling.
          Using <button> (not <a>) because navigation triggers a panel
          swap in the same page — no URL change, so anchor semantics
          would be misleading.
      ──────────────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`${styles.navItem} ${activeTab === n.id ? styles.navActive : ""}`}
            onClick={() => setActiveTab(n.id)}
          >
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      <div className={styles.divider} />

      {/* ── Persona switcher ──────────────────────────────────────────────────
          Each card represents a different system prompt preset.
          Clicking a card calls setPersona(id), which the parent uses to
          fire POST /configure with the corresponding prompt string.
          The active card gets .personaActive for a highlighted border/bg.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>PERSONA</div>
        <div className={styles.personas}>
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              className={`${styles.personaCard} ${persona === p.id ? styles.personaActive : ""}`}
              onClick={() => setPersona(p.id)}
            >
              {/* Large icon gives the card a quick visual anchor at a glance */}
              <span className={styles.personaIcon}>{p.icon}</span>
              <div>
                <div className={styles.personaName}>{p.label}</div>
                {/* Short descriptor sets user expectations before they switch */}
                <div className={styles.personaDesc}>{p.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── Sidebar footer ────────────────────────────────────────────────────
          Lightweight social proof ("Built in 4 days") + GitHub link.
          Intentionally minimal — the footer should not compete with
          the main controls for the user's attention.
      ──────────────────────────────────────────────────────────────────── */}
      <div className={styles.sidebarFooter}>
        <div className={styles.footerMeta}>
          <span>Built in 4 days</span>
          <span className={styles.footerDot}>·</span>
          <span>Deepgram + Groq</span>
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer" /* Security best practice: prevents tab-napping */
          className={styles.footerGh}
        >
          GitHub ↗
        </a>
      </div>
    </aside>
  );
}
