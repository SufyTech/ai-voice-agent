/**
 * useVoiceAgent.js
 *
 * Custom React hook — the core brain of the Voice Agent frontend.
 *
 * Responsibilities:
 *  - Manages the full voice pipeline: mic capture → audio upload → AI response → playback
 *  - Implements auto-stop via silence detection using the Web Audio API analyser node
 *  - Handles environment noise calibration so silence detection adapts to the user's room
 *  - Streams the AI text reply character-by-character to simulate a typing effect
 *  - Tracks live session statistics (latency, turns, tokens, interrupts)
 *  - Communicates with all five backend endpoints: /voice, /interrupt, /reset, /configure, /status
 *
 * State exposed to consumers:
 *  @returns {Array}    messages       - Full conversation history (user + assistant turns)
 *  @returns {boolean}  isRecording    - True while mic is actively capturing audio
 *  @returns {boolean}  isProcessing   - True while waiting for backend response or playing audio
 *  @returns {boolean}  connected      - Whether the FastAPI backend is reachable
 *  @returns {Object}   stats          - Live session metrics { latencies, turns, tokens, interrupts }
 *
 * Actions exposed to consumers:
 *  @returns {Function} startRecording   - Begin mic capture + start silence detection
 *  @returns {Function} stopRecording    - Manually stop capture and dispatch audio
 *  @returns {Function} interrupt        - Cancel current AI audio playback immediately
 *  @returns {Function} reset            - Clear all state and reset backend conversation
 *  @returns {Function} configurePersona - Send a new persona config to POST /configure
 *
 * Ref inventory (internal — not exposed):
 *  mediaRef     - MediaRecorder instance for the current recording session
 *  chunksRef    - Accumulates audio Blob chunks as MediaRecorder fires ondataavailable
 *  audioRef     - Current HTMLAudioElement playing the AI voice response
 *  startTimeRef - Timestamp used to calculate round-trip latency per turn
 *  streamRef    - Raw MediaStream reference kept for track cleanup on stop
 *  isRecRef     - Ref mirror of isRecording used inside intervals/callbacks
 *                 (avoids stale closure issues where useState would return old value)
 *  silenceRef   - setInterval handle for the silence detection loop
 */

import { useState, useRef, useCallback, useEffect } from "react";

// Backend base URL — reads from Vite env var at build time, falls back to local dev server
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function useVoiceAgent() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState({
    latencies: [], // ms per turn — used for avg calculation and sparkline
    turns: 0, // total completed conversation turns
    tokens: 0, // estimated cumulative tokens (reply.length / 4 approximation)
    interrupts: 0, // how many times user interrupted the agent mid-response
  });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const mediaRef = useRef(null); // Active MediaRecorder instance
  const chunksRef = useRef([]); // Audio data chunks collected during recording
  const audioRef = useRef(null); // Currently playing Audio element (AI voice)
  const startTimeRef = useRef(null); // Records when POST /voice was sent for latency calc
  const streamRef = useRef(null); // Raw MediaStream — needed to stop mic tracks on cleanup
  const isRecRef = useRef(false); // Ref copy of isRecording for use inside setInterval callbacks
  const silenceRef = useRef(null); // Interval handle for the silence detection loop

  // ── Backend health check ──────────────────────────────────────────────────
  // Fires once on mount to determine if the FastAPI backend is reachable.
  // Updates the connected state which drives the sidebar status badge.
  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => setConnected(r.ok))
      .catch(() => setConnected(false));
  }, []);

  /**
   * sendAudio
   *
   * Dispatches a recorded audio Blob to POST /voice and handles the full response:
   *  1. Skips blobs under 500 bytes (accidental clicks with no real audio)
   *  2. Shows a placeholder "..." user message immediately while waiting
   *  3. Reads X-Transcript and X-Reply from response headers
   *  4. Updates the user message with the real transcript
   *  5. Creates an assistant message and streams the reply text character by character
   *     at ~16ms intervals (≈60fps) to simulate a typing effect
   *  6. Decodes the audio response body and plays it concurrently with the text stream
   *  7. Updates session stats (latency, turns, token estimate) on success
   *  8. Marks backend as disconnected and shows an error label on failure
   *
   * Token estimation: reply.length / 4 is a rough approximation of GPT-style
   * tokenisation — good enough for the stats display, not for billing.
   */
  const sendAudio = useCallback(async (blob) => {
    // Guard: ignore near-empty blobs from accidental mic activations
    if (blob.size < 500) {
      setIsProcessing(false);
      return;
    }

    startTimeRef.current = Date.now();

    // Optimistically add a user turn placeholder — updated with real transcript once response arrives
    const userMsgId = `u-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: "...", isStreaming: true },
    ]);

    try {
      const form = new FormData();
      form.append("audio", blob, "audio.webm");

      const res = await fetch(`${API}/voice`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Headers carry the transcript and LLM reply — audio is in the response body
      const transcript = res.headers.get("X-Transcript") || "";
      const reply = res.headers.get("X-Reply") || "";
      const latency = Date.now() - startTimeRef.current;

      // Replace placeholder with real transcript
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsgId
            ? {
                ...m,
                text: transcript || "(no transcript)",
                isStreaming: false,
              }
            : m,
        ),
      );

      // Add assistant turn with empty text — populated character by character below
      const asstId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: asstId, role: "assistant", text: "", isStreaming: true, latency },
      ]);

      // Decode audio body and begin playback — runs concurrently with the text stream below
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      // Revoke object URL and clear ref once playback ends to avoid memory leaks
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.play().catch(console.error);

      // Character-by-character text stream at ~16ms per character (≈60fps)
      // Simulates a typewriter effect while audio plays in parallel
      for (let i = 0; i <= reply.length; i++) {
        await new Promise((r) => setTimeout(r, 16));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId ? { ...m, text: reply.slice(0, i) } : m,
          ),
        );
      }

      // Mark assistant turn complete — removes the blinking cursor
      setMessages((prev) =>
        prev.map((m) => (m.id === asstId ? { ...m, isStreaming: false } : m)),
      );

      // Append this turn's stats: latency reading, increment turns, add token estimate
      setStats((prev) => ({
        latencies: [...prev.latencies, latency],
        turns: prev.turns + 1,
        tokens: prev.tokens + Math.ceil(reply.length / 4), // rough tokenisation estimate
        interrupts: prev.interrupts,
      }));

      setConnected(true);
    } catch (err) {
      // Show error in the user placeholder bubble and flag backend as unreachable
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsgId
            ? { ...m, text: "(backend error)", isStreaming: false }
            : m,
        ),
      );
      setConnected(false);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * doStop
   *
   * Internal helper that finalises a recording session and dispatches the audio.
   * Called both by stopRecording (manual) and by the silence detection interval (auto).
   *
   * Uses isRecRef (not isRecording state) to avoid stale closure issues when called
   * from inside a setInterval callback — React state reads inside closures capture
   * the value at the time the closure was created, not the current value.
   *
   * The onstop handler fires after MediaRecorder flushes its final chunk,
   * so the Blob is assembled there rather than immediately on .stop().
   */
  const doStop = useCallback(() => {
    // Guard: no-op if not currently recording
    if (!isRecRef.current || !mediaRef.current) return;

    // Clear the silence detection interval before stopping the recorder
    if (silenceRef.current) {
      clearInterval(silenceRef.current);
      silenceRef.current = null;
    }

    isRecRef.current = false;
    setIsRecording(false);
    setIsProcessing(true);

    // onstop fires after MediaRecorder flushes all pending data — assemble Blob here
    mediaRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      // Release mic track so the browser stops showing the "recording" indicator
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      sendAudio(blob);
    };

    mediaRef.current.stop();
  }, [sendAudio]);

  /**
   * startRecording
   *
   * Requests mic access, initialises MediaRecorder, then starts the
   * silence detection pipeline using the Web Audio API analyser node.
   *
   * Silence detection pipeline:
   *  1. AudioContext reads raw mic frequency data via an AnalyserNode
   *  2. First 1000ms is a calibration phase — measures ambient noise peak
   *  3. After calibration, threshold = ambient average + 20 (headroom above noise floor)
   *  4. Every 100ms: if peak > threshold, user is speaking (reset silence counter)
   *  5. After 10 consecutive silent ticks (1 second of silence post-speech) → auto-stop
   *
   * The calibration phase prevents false auto-stops in noisy environments
   * (e.g. fans, traffic, office noise) that would otherwise exceed a fixed threshold.
   *
   * If AI audio is currently playing when the user starts recording, it is
   * interrupted immediately — this is the "barge-in" / interrupt-on-speak behaviour.
   */
  const startRecording = useCallback(async () => {
    // Guard: prevent double-start or starting while backend is still processing
    if (isRecRef.current || isProcessing) return;

    // Interrupt any currently playing AI audio (barge-in support)
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      try {
        await fetch(`${API}/interrupt`, { method: "POST" });
      } catch {}
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // MediaRecorder fires ondataavailable every 100ms — small chunks for responsive auto-stop
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(100); // timeslice: 100ms — controls how often ondataavailable fires
      mediaRef.current = mr;

      // Sync ref immediately so setInterval callbacks see the current value
      isRecRef.current = true;
      setIsRecording(true);

      // ── Web Audio API silence detection setup ──────────────────────────────
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; // 128 frequency bins — sufficient resolution for voice detection
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      // Calibration state
      let calibSamples = []; // Peak values collected during calibration window
      let calibDone = false;
      let silentTicks = 0; // Consecutive silent 100ms intervals after speech detected
      let threshold = 20; // Default before calibration completes
      let spokenOnce = false; // Prevents auto-stop before user has spoken at all

      // After 1 second, compute ambient noise average and set the detection threshold
      const calibTimer = setTimeout(() => {
        calibDone = true;
        const avg =
          calibSamples.length > 0
            ? calibSamples.reduce((a, b) => a + b, 0) / calibSamples.length
            : 10;
        threshold = avg + 20; // +20 headroom above noise floor to avoid false triggers
      }, 1000);

      // Silence detection loop — runs every 100ms while recording
      silenceRef.current = setInterval(() => {
        // If recording was stopped externally, clean up and exit
        if (!isRecRef.current) {
          clearInterval(silenceRef.current);
          ctx.close();
          return;
        }

        analyser.getByteFrequencyData(data);
        const peak = Math.max(...data); // Highest frequency bin amplitude this tick

        if (!calibDone) {
          // Still calibrating — collect ambient peak samples
          calibSamples.push(peak);
          return;
        }

        if (peak > threshold) {
          // User is speaking — reset silence counter and mark that speech has started
          spokenOnce = true;
          silentTicks = 0;
        } else if (spokenOnce) {
          // User was speaking but has now gone quiet — increment silence counter
          silentTicks++;
          if (silentTicks >= 10) {
            // 1 second of post-speech silence → trigger auto-stop
            clearInterval(silenceRef.current);
            clearTimeout(calibTimer);
            ctx.close();
            doStop();
          }
        }
        // If spokenOnce is false, user hasn't started speaking — keep waiting
      }, 100);
    } catch (err) {
      // Mic access denied or hardware error — log and silently fail
      console.error("Mic error:", err);
    }
  }, [isProcessing, doStop]);

  /**
   * stopRecording
   * Public wrapper around doStop for manual stop (e.g. button click).
   * Kept separate so consumers don't need to know about the internal doStop ref.
   */
  const stopRecording = useCallback(() => {
    doStop();
  }, [doStop]);

  /**
   * interrupt
   * Immediately halts AI audio playback and increments the interrupt counter.
   * Also fires POST /interrupt to notify the backend (allows it to stop any
   * ongoing TTS generation server-side, saving tokens/compute).
   */
  const interrupt = useCallback(async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsProcessing(false);
    setStats((prev) => ({ ...prev, interrupts: prev.interrupts + 1 }));
    try {
      await fetch(`${API}/interrupt`, { method: "POST" });
    } catch {}
  }, []);

  /**
   * reset
   * Clears all conversation state and resets the backend session.
   * Calls interrupt first to stop any in-progress audio before wiping state.
   * POST /reset tells the backend to clear its conversation history,
   * so the next turn starts with a clean context window.
   */
  const reset = useCallback(async () => {
    interrupt();
    setMessages([]);
    setStats({ latencies: [], turns: 0, tokens: 0, interrupts: 0 });
    try {
      await fetch(`${API}/reset`, { method: "POST" });
    } catch {}
  }, [interrupt]);

  /**
   * configurePersona
   * Sends a new persona identifier to POST /configure.
   * The backend maps persona IDs to system prompts and applies them
   * to subsequent LLM calls, changing the agent's personality and tone.
   */
  const configurePersona = useCallback(async (persona) => {
    try {
      await fetch(`${API}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
    } catch {}
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────────
  // Only expose what consumers need — internal helpers (doStop, sendAudio)
  // are deliberately excluded to keep the hook's interface minimal.
  return {
    messages,
    isRecording,
    isProcessing,
    connected,
    stats,
    startRecording,
    stopRecording,
    interrupt,
    reset,
    configurePersona,
  };
}
