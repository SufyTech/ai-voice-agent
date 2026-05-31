"""
test_api.py

Manual smoke-test script for the Voice Agent FastAPI backend.
Exercises every public endpoint in sequence and prints the responses
to stdout so failures are immediately visible.

Usage:
    1. Start the FastAPI server:  uvicorn main:app --reload
    2. Ensure test.wav exists in the same directory (any short WAV file works).
    3. Run:  python test_api.py

This is an integration test (real HTTP calls against a live server),
not a unit test. It is intentionally sequential — each test builds on
the server state left by the previous one (e.g. TEST 6 verifies that
TEST 5's reset actually cleared the custom persona).

Endpoints covered:
    GET  /           → health check
    GET  /status     → connection / model status
    POST /configure  → override system prompt (Feature 5)
    POST /chat       → text-based LLM turn (Features 2, 3)
    POST /reset      → clear conversation history (Feature 2)
    POST /interrupt  → abort in-flight TTS/LLM response (Feature 1)
    POST /voice      → full STT → LLM → TTS pipeline (Features 1+3+4)
"""

import requests

# Base URL of the locally running FastAPI server.
# Change this to a deployed URL for staging/production smoke tests.
BASE = "http://localhost:8000"

print("=" * 50)

# ─── TEST 1 — Health check ────────────────────────────────────────────────────
# Hits the root GET endpoint which should return a simple alive/version response.
# If this fails the server is not running or is unreachable — no point continuing.
print("TEST 1 — Health check")
r = requests.get(f"{BASE}/")
print(r.json())

# ─── TEST 2 — Status endpoint ─────────────────────────────────────────────────
# Returns the current connection state and active model identifiers
# (STT, LLM, TTS). Useful for verifying API keys are loaded and
# downstream services (Deepgram, Groq) are reachable.
print("\nTEST 2 — Status endpoint")
r = requests.get(f"{BASE}/status")
print(r.json())

# ─── TEST 3 — Configure system prompt (Feature 5) ────────────────────────────
# Overrides the default system prompt with a custom persona.
# Subsequent /chat calls in TEST 4 should reflect this new personality,
# confirming the server correctly stores and applies the configured prompt.
print("\nTEST 3 — Configure system prompt (Feature 5)")
r = requests.post(f"{BASE}/configure", json={
    "system_prompt": "You are a sarcastic AI assistant who gives witty one-liner replies."
})
print(r.json())

# ─── TEST 4 — Chat with new personality ──────────────────────────────────────
# Sends a text message immediately after TEST 3's configure call.
# The response tone should be sarcastic/witty, validating that the
# custom system prompt from TEST 3 is active.
print("\nTEST 4 — Chat with new personality")
r = requests.post(f"{BASE}/chat", json={"message": "What is Python?"})
print(r.json())

# ─── TEST 5 — Reset conversation (Feature 2) ─────────────────────────────────
# Clears the in-memory conversation history and resets the system prompt
# back to the server default. TEST 6 immediately follows to confirm the reset
# actually took effect — if TEST 6's tone is still sarcastic, reset is broken.
print("\nTEST 5 — Reset conversation (Feature 2)")
r = requests.post(f"{BASE}/reset")
print(r.json())

# ─── TEST 6 — Chat after reset — should be default personality again ──────────
# Identical prompt to TEST 4. The reply should now reflect the default
# assistant persona, not the sarcastic one configured in TEST 3.
# Side-by-side comparison of TEST 4 and TEST 6 output is the manual assertion.
print("\nTEST 6 — Chat after reset — should be default personality again")
r = requests.post(f"{BASE}/chat", json={"message": "What is Python?"})
print(r.json())

# ─── TEST 7 — Empty message error handling (Feature 3) ───────────────────────
# Sends an empty string as the message body.
# The server should reject this with a 4xx status code and a descriptive
# error payload rather than forwarding a blank prompt to the LLM.
# Prints both status_code and json so the error shape is visible.
print("\nTEST 7 — Empty message error handling (Feature 3)")
r = requests.post(f"{BASE}/chat", json={"message": ""})
print(r.status_code, r.json())

# ─── TEST 8 — Interrupt endpoint (Feature 1) ─────────────────────────────────
# Signals the server to abort any in-flight LLM/TTS response.
# Called here without a concurrent streaming request, so it tests the
# endpoint's availability and response shape rather than true interruption
# behaviour (which requires a concurrent client to observe properly).
print("\nTEST 8 — Interrupt endpoint (Feature 1)")
r = requests.post(f"{BASE}/interrupt")
print(r.json())

# ─── TEST 9 — Full pipeline with streaming (Features 1+3+4) ──────────────────
# End-to-end test of the voice pipeline:
#   1. Uploads a WAV file → server runs Deepgram STT
#   2. Transcribed text → Groq LLM generates a reply
#   3. Reply text → Deepgram TTS synthesises audio
#   4. Server streams audio bytes back in the response body
#
# The transcript and text reply are returned as custom response headers
# (X-Transcript, X-Reply) so they can be inspected without parsing audio.
# Printing len(r.content) confirms audio bytes were actually returned
# (a length of 0 indicates TTS failed silently).
#
# Requires test.wav to exist in the working directory. Any short mono WAV works.
print("\nTEST 9 — Full pipeline with streaming (Features 1+3+4)")
with open("test.wav", "rb") as f:
    files = {"audio": ("test.wav", f, "audio/wav")}
    r = requests.post(f"{BASE}/voice", files=files)
print("Transcript:", r.headers.get("X-Transcript"))
print("Reply:", r.headers.get("X-Reply"))
print("Audio bytes received:", len(r.content))

print("\n" + "=" * 50)
print("ALL TESTS DONE")