/**
 * LandingPage.jsx
 *
 * Top-of-funnel marketing page for the VoiceAgent application.
 * Renders hero, demo mockup, stats, how-it-works, tech stack,
 * author bio, and bottom CTA before the user enters the app.
 *
 * Props:
 *   onEnterApp {Function} — swaps the view from landing to the
 *                           voice-agent workspace (owned by parent).
 *
 * Animation strategy:
 *   - Page fade-in via a `visible` boolean set on mount.
 *   - Demo chat auto-sequences through DEMO_MESSAGES with staggered
 *     timeouts and resets after a 3 s pause at the end.
 */

import { useState, useEffect, useRef } from "react";
import styles from "./LandingPage.module.css";

// ---------------------------------------------------------------------------
// Static data — module scope so these are never re-created on re-render.
// ---------------------------------------------------------------------------

/** Headline metrics shown in the stats bar below the hero. */
const STATS = [
  { value: "<400ms", label: "Avg Latency" },
  { value: "9", label: "API Endpoints" },
  { value: "4 days", label: "Build Time" },
  { value: "3", label: "AI Services" },
];

/**
 * Pipeline steps for the "How it works" section.
 * CSS custom property --i is used by the stylesheet for staggered
 * entrance animation delays without any JS involvement.
 */
const STEPS = [
  {
    icon: "🎙️",
    step: "01",
    title: "Speak",
    desc: "Press the mic. Your voice streams live to Deepgram's ASR pipeline — transcribed in real time.",
  },
  {
    icon: "⚡",
    step: "02",
    title: "Think",
    desc: "Transcript hits Groq's LLM at blistering speed. Context, persona, and memory injected automatically.",
  },
  {
    icon: "🔊",
    step: "03",
    title: "Reply",
    desc: "Response synthesised and streamed back. Interrupt any time — agent stops mid-sentence, instantly.",
  },
  {
    icon: "📊",
    step: "04",
    title: "Analyse",
    desc: "Every session logs latency, token counts, transcript quality. Live stats surface in your dashboard.",
  },
];

/**
 * Tech stack cards for the "Tech Stack" section.
 * color is injected as CSS custom property --c so each card's accent
 * dot matches the tool's brand colour without per-card CSS classes.
 */
const TECH = [
  { name: "Deepgram", role: "Speech-to-Text", color: "#13ef93" },
  { name: "Groq", role: "LLM Inference", color: "#f55036" },
  { name: "FastAPI", role: "Backend API", color: "#009688" },
  { name: "React", role: "Frontend", color: "#61dafb" },
  { name: "Vite", role: "Build Tool", color: "#bd34fe" },
  { name: "WebSockets", role: "Real-time Stream", color: "#ffb547" },
];

/**
 * Pre-scripted conversation for the hero demo mockup.
 * latency is only set on assistant turns; rendered as a small badge
 * to reinforce the sub-400 ms performance story visually.
 */
const DEMO_MESSAGES = [
  {
    role: "user",
    text: "What's the fastest sorting algorithm?",
    latency: null,
  },
  {
    role: "assistant",
    text: "QuickSort averages O(n log n) — fastest in practice for most datasets.",
    latency: "312ms",
  },
  { role: "user", text: "Can you explain it simply?", latency: null },
  {
    role: "assistant",
    text: "Pick a pivot, split smaller left and larger right, repeat. Done recursively.",
    latency: "287ms",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPage({ onEnterApp }) {
  // Controls the top-level CSS fade-in class; set true after first paint
  // so the browser has a defined start state before the transition fires.
  const [visible, setVisible] = useState(false);

  // Drives the mobile hamburger / drawer toggle.
  const [menuOpen, setMenuOpen] = useState(false);

  // Index of the next DEMO_MESSAGES entry to reveal in the hero mockup.
  const [demoIdx, setDemoIdx] = useState(0);

  // Accumulates revealed message indices; flushed to [] when the loop resets.
  const [demoVisible, setDemoVisible] = useState([]);

  // Kept for potential future scroll / IntersectionObserver hooks.
  const heroRef = useRef(null);

  // Trigger entrance animation after initial paint.
  useEffect(() => {
    setVisible(true);
  }, []);

  /**
   * Demo message sequencer — reveals bubbles one at a time.
   * Timing: 800 ms before the first message (lets the hero settle),
   * 1800 ms between subsequent ones (feels conversational).
   * Loops automatically with a 3 s pause after the last message.
   */
  useEffect(() => {
    if (demoIdx >= DEMO_MESSAGES.length) {
      // All messages shown — pause then restart the loop.
      const t = setTimeout(() => {
        setDemoIdx(0);
        setDemoVisible([]);
      }, 3000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        setDemoVisible((prev) => [...prev, demoIdx]);
        setDemoIdx((prev) => prev + 1);
      },
      demoIdx === 0 ? 800 : 1800,
    );
    return () => clearTimeout(t);
  }, [demoIdx]);

  // Doubled so the circular SVG textPath loop appears seamless.
  const waveChars = "VOICE AI AGENT ◆ ".split("");

  return (
    <div className={`${styles.page} ${visible ? styles.visible : ""}`}>
      {/* Decorative background — orb1/orb2 are blurred radial gradients,
          grid adds a subtle dot pattern. No semantic role. */}
      <div className={styles.ambientBg}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.grid} />
      </div>

      {/* Nav — logo+badge left, desktop links right, hamburger mobile-only. */}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <span className={styles.logoDot} />
          <span>VoiceAgent</span>
          <span className={styles.navBadge}>BETA</span>
        </div>

        {/* Desktop links — hidden via CSS below the mobile breakpoint. */}
        <div className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#tech">Stack</a>
          <a href="#author">Builder</a>
          <a
            href="https://github.com/YOUR_USERNAME/ai-voice-agent"
            target="_blank"
            rel="noreferrer"
            className={styles.navGh}
          >
            GitHub ↗
          </a>
        </div>

        {/* Hamburger — three spans animated into an X by CSS on open. */}
        <button
          className={styles.hamburger}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className={menuOpen ? styles.hamLineOpen1 : styles.hamLine} />
          <span className={menuOpen ? styles.hamLineOpen2 : styles.hamLine} />
          <span className={menuOpen ? styles.hamLineOpen3 : styles.hamLine} />
        </button>
      </nav>

      {/* Mobile drawer — conditionally mounted so the DOM stays clean.
          Every link closes the drawer on click. */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          <a href="#how" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          <a href="#tech" onClick={() => setMenuOpen(false)}>
            Stack
          </a>
          <a href="#author" onClick={() => setMenuOpen(false)}>
            Builder
          </a>
          <a
            href="https://github.com/YOUR_USERNAME/ai-voice-agent"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            GitHub ↗
          </a>
          <button
            className={styles.ctaPrimary}
            onClick={() => {
              setMenuOpen(false);
              onEnterApp();
            }}
          >
            <span className={styles.ctaOrb} />
            Try it live →
          </button>
        </div>
      )}

      {/* Hero — two-column layout (heroLeft: copy + CTAs, heroRight: demo). */}
      <section className={styles.hero} ref={heroRef}>
        <div className={styles.heroLeft}>
          {/* Eyebrow live-pulse dot reinforces the real-time angle. */}
          <div className={styles.heroEyebrow}>
            <span className={styles.liveDot} />
            Live · Under 400ms round-trip
          </div>

          <h1 className={styles.heroTitle}>
            Talk to AI.
            <br />
            <span className={styles.heroAccent}>Instantly.</span>
          </h1>

          <p className={styles.heroSub}>
            A real-time voice agent built with Deepgram, Groq, and FastAPI.
            Speak, interrupt, switch personas — all sub-400ms.
          </p>

          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={onEnterApp}>
              <span className={styles.ctaOrb} />
              Try it live — no signup needed →
            </button>
            <a
              href="https://github.com/YOUR_USERNAME/ai-voice-agent"
              target="_blank"
              rel="noreferrer"
              className={styles.ctaSecondary}
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Animated demo mockup — mimics the real agent UI.
            Messages revealed sequentially by demoIdx effect.
            Typing indicator (3 spans) shows while next message is pending. */}
        <div className={styles.heroRight}>
          <div className={styles.demoCard}>
            {/* Faux window chrome — traffic-light dots + title + live badge. */}
            <div className={styles.demoHeader}>
              <div className={styles.demoDots}>
                <span />
                <span />
                <span />
              </div>
              <span className={styles.demoTitle}>Voice Agent · Live</span>
              <span className={styles.demoBadge}>● LIVE</span>
            </div>

            <div className={styles.demoMessages}>
              {DEMO_MESSAGES.map(
                (m, i) =>
                  demoVisible.includes(i) && (
                    <div
                      key={i}
                      className={`${styles.demoMsg} ${styles["demo_" + m.role]}`}
                    >
                      <div className={styles.demoBubble}>{m.text}</div>
                      {/* Latency badge — assistant turns only. */}
                      {m.latency && (
                        <span className={styles.demoLatency}>{m.latency}</span>
                      )}
                    </div>
                  ),
              )}
              {/* Typing indicator — visible while sequence is still running. */}
              {demoIdx < DEMO_MESSAGES.length && demoVisible.length > 0 && (
                <div className={`${styles.demoMsg} ${styles.demo_assistant}`}>
                  <div className={`${styles.demoBubble} ${styles.demoTyping}`}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>

            <div className={styles.demoFooter}>
              <div className={styles.demoMic}>🎙️</div>
              <span className={styles.demoMicLabel}>Click to speak</span>
            </div>
          </div>

          {/* Rotating text ring — SVG textPath on a circular arc.
              Text is doubled so the loop is seamless at all angles. */}
          <div className={styles.heroRing}>
            <svg viewBox="0 0 200 200" width="200" height="200">
              <defs>
                <path
                  id="circle"
                  d="M 100,100 m -75,0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0"
                />
              </defs>
              <text
                fontSize="11"
                fill="var(--text-3)"
                fontFamily="var(--font-mono)"
                letterSpacing="4"
              >
                <textPath href="#circle">
                  {waveChars.join("")}
                  {waveChars.join("")}
                </textPath>
              </text>
            </svg>
          </div>
        </div>
      </section>

      {/* Stats bar — four headline metrics, purely informational. */}
      <section className={styles.statsBar}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </section>

      {/* How it works — step cards from STEPS constant.
          --i drives staggered CSS entrance delays. Arrow omitted after last card. */}
      <section className={styles.section} id="how">
        <div className={styles.sectionHead}>
          <span className={styles.sectionTag}>HOW IT WORKS</span>
          <h2 className={styles.sectionTitle}>
            Four steps.
            <br />
            Zero lag.
          </h2>
        </div>
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s.step} className={styles.stepCard} style={{ "--i": i }}>
              <div className={styles.stepNum}>{s.step}</div>
              <div className={styles.stepIcon}>{s.icon}</div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
              {/* Arrow connector — omitted after the final step. */}
              {i < STEPS.length - 1 && (
                <div className={styles.stepArrow}>→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack — cards colour-coded via CSS custom property --c. */}
      <section className={styles.section} id="tech">
        <div className={styles.sectionHead}>
          <span className={styles.sectionTag}>TECH STACK</span>
          <h2 className={styles.sectionTitle}>
            Built with
            <br />
            serious tools.
          </h2>
        </div>
        <div className={styles.techGrid}>
          {TECH.map((t) => (
            <div
              key={t.name}
              className={styles.techCard}
              style={{ "--c": t.color }}
            >
              <div className={styles.techDot} />
              <div className={styles.techName}>{t.name}</div>
              <div className={styles.techRole}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Author — avatar initials, bio, social links.
          Also serves as a soft hiring signal for recruiters finding the project. */}
      <section className={styles.section} id="author">
        <div className={styles.authorBox}>
          {/* Initials avatar — no external image dependency. */}
          <div className={styles.authorAvatar}>SK</div>
          <div className={styles.authorInfo}>
            <div className={styles.authorName}>Sufiyan Khan</div>
            <div className={styles.authorRole}>
              Full Stack AI Engineer · Pune, India
            </div>
            <p className={styles.authorBio}>
              Built this AI voice agent in 4 days as a demonstration of
              real-time speech AI. Passionate about building products at the
              intersection of AI and great UX. Open to Founding Engineer roles
              at AI-first startups.
            </p>
            <div className={styles.authorLinks}>
              <a
                href="https://linkedin.com/in/YOUR_USERNAME"
                target="_blank"
                rel="noreferrer"
                className={styles.authorLink}
              >
                LinkedIn ↗
              </a>
              <a
                href="https://github.com/YOUR_USERNAME"
                target="_blank"
                rel="noreferrer"
                className={styles.authorLink}
              >
                GitHub ↗
              </a>
              <a href="mailto:YOUR_EMAIL" className={styles.authorLink}>
                Email ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA bottom — closing conversion block.
          Inline style intentionally increases button size vs nav CTAs. */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaBox}>
          <h2 className={styles.ctaTitle}>Ready to hear it?</h2>
          <p className={styles.ctaSub}>
            No signup. No setup. No credit card. Just press a button and speak.
          </p>
          <button
            className={styles.ctaPrimary}
            onClick={onEnterApp}
            style={{ fontSize: "1.1rem", padding: "16px 40px" }}
          >
            <span className={styles.ctaOrb} />
            Launch Voice Agent — it's free →
          </button>
          <div className={styles.ctaLinks}>
            <a
              href="https://github.com/YOUR_USERNAME/ai-voice-agent"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <span>·</span>
            <a
              href="https://linkedin.com/in/YOUR_USERNAME"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn ↗
            </a>
          </div>
        </div>
      </section>

      {/* Footer — footerAccent mutes the copyright to avoid competing with body copy. */}
      <footer className={styles.footer}>
        <span>Built by Sufiyan Khan · Deepgram · Groq · FastAPI · React</span>
        <span className={styles.footerAccent}>VoiceAgent © 2026</span>
      </footer>
    </div>
  );
}
