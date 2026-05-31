"""
test_live_full.py

Full end-to-end local voice agent test that runs entirely on the client side,
bypassing the FastAPI /voice endpoint. Used to validate the complete real-time
pipeline outside of the server layer:

    Microphone → PyAudio capture → Deepgram streaming STT
        → Groq LLM (llama-3.1-8b-instant)
        → Deepgram TTS (aura-asteria-en)
        → os.startfile playback

The FastAPI server is still used for /interrupt and /configure signals,
but audio processing happens here directly — not via /voice.

Architecture notes:
    - Audio capture runs in a dedicated daemon thread (send_audio) to avoid
      blocking the main recv() loop.
    - Transcript handling (LLM + TTS) also runs in daemon threads so a slow
      LLM response never blocks incoming audio or transcript events.
    - is_final (chunk-level finality) is used instead of speech_final
      (utterance-level finality) for lower perceived latency — see inline comment.

Usage:
    1. Start the FastAPI server:  uvicorn main:app --reload
    2. Ensure DEEPGRAM_API_KEY and GROQ_API_KEY are set in .env
    3. Run:  python test_live_full.py
    4. Speak into the microphone; press Ctrl+C to stop.

Dependencies:
    pyaudio — microphone capture (requires PortAudio system library)
    deepgram-sdk>=3 — streaming STT + TTS
    groq — LLM inference
"""

import os
import io
import threading
import pyaudio
import requests
from dotenv import load_dotenv
from deepgram import DeepgramClient
from deepgram.listen.v1.types import ListenV1Results
from groq import Groq

# Load DEEPGRAM_API_KEY and GROQ_API_KEY from .env into the process environment.
load_dotenv()

# ─── PyAudio capture constants ────────────────────────────────────────────────
# These values must match the encoding parameters sent to Deepgram's
# streaming STT connection (linear16 @ 16kHz mono) — a mismatch causes
# garbled or empty transcripts.
CHUNK    = 1024          # Frames per PyAudio read() call — ~64ms of audio at 16kHz
FORMAT   = pyaudio.paInt16  # 16-bit linear PCM — matches Deepgram encoding="linear16"
CHANNELS = 1             # Mono — Deepgram nova-2 expects single-channel audio
RATE     = 16000         # 16kHz sample rate — minimum for accurate STT

# Base URL of the FastAPI server used for /interrupt and /configure calls.
BASE = "http://localhost:8000"

# ─── Service clients ──────────────────────────────────────────────────────────
# Both clients are module-level singletons — instantiated once and reused
# across all transcript handler threads to avoid repeated auth overhead.
dg          = DeepgramClient(api_key=os.getenv("DEEPGRAM_API_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ─── Active persona ───────────────────────────────────────────────────────────
# Module-level mutable string holding the current system prompt.
# Modified only by set_persona(); read by handle_transcript() on every LLM call.
# Not thread-safe for concurrent writes, but set_persona is called synchronously
# before live_transcribe() starts, so no race condition exists in practice.
current_persona = "You are a helpful AI voice assistant. Keep replies short, max 2 sentences. No bullet points."


def play_audio(audio_bytes):
    """
    Write TTS audio bytes to a temporary MP3 file and open it with the
    system default media player via os.startfile.

    os.startfile is Windows-only. On macOS/Linux replace with:
        subprocess.Popen(["afplay", temp_path])   # macOS
        subprocess.Popen(["mpg123", temp_path])   # Linux

    The temp file is not deleted after playback — on Windows, os.startfile
    returns immediately (before playback finishes) so the file must remain
    on disk until the player is done. Manual cleanup or tempfile management
    can be added if disk usage becomes a concern.
    """
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name
    os.startfile(temp_path)


def handle_transcript(transcript):
    """
    Full response pipeline for a single confirmed transcript:
        1. Validate — skip empty or whitespace-only transcripts.
        2. Interrupt — signal the server to abort any in-flight response.
        3. LLM inference — send the transcript to Groq and get a text reply.
        4. TTS synthesis — convert the reply to MP3 audio via Deepgram.
        5. Playback — play the audio through the system default player.

    Called from a daemon thread (spawned in live_transcribe) so it never
    blocks the main recv() loop or the audio capture thread.
    """
    # Guard: Deepgram may fire is_final events with empty transcripts during
    # silence. Skip them to avoid sending blank prompts to the LLM.
    if not transcript.strip():
        return

    print(f"\nYou said: {transcript}")

    # Interrupt any in-flight server-side response before starting a new one.
    # Fire-and-forget POST — we don't wait for or check the response because
    # the new LLM call below is the priority.
    requests.post(f"{BASE}/interrupt")

    print("AI thinking...")

    # LLM inference — single-turn request with the active persona as system prompt.
    # model: llama-3.1-8b-instant — 8B parameter model chosen for low latency
    #        over the 70B variant; acceptable quality for short voice replies.
    # max_tokens=80: caps reply at ~60 words — keeps TTS audio short and snappy.
    # temperature=0.7: balanced creativity vs. consistency for conversational use.
    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": current_persona},
            {"role": "user",   "content": transcript}
        ],
        max_tokens=80,
        temperature=0.7,
    )
    reply = response.choices[0].message.content
    print(f"AI says: {reply}")

    # TTS synthesis — Deepgram Aura streams audio as an iterator of byte chunks.
    # Joining all chunks into a single bytes object before playback ensures
    # the entire audio is available before os.startfile is called.
    # model: aura-asteria-en — Deepgram's default English female neural voice.
    # encoding: mp3 — compressed format; smaller than WAV for network transfer.
    audio_iterator = dg.speak.v1.audio.generate(
        text=reply,
        model="aura-asteria-en",
        encoding="mp3",
    )
    audio_bytes = b"".join(audio_iterator)
    play_audio(audio_bytes)


def set_persona(persona_name):
    """
    Switch the active AI persona by updating current_persona and notifying
    the FastAPI server via /configure.

    The personas dict encodes four distinct communication styles. Each prompt
    ends with hard constraints ("Max 2 sentences. No markdown.") to keep TTS
    output short and free of symbols that sound wrong when spoken aloud.

    Falls back to "assistant" silently if an unrecognised persona_name is passed,
    ensuring the system always has a valid prompt even on bad input.
    """
    global current_persona
    personas = {
        "assistant": "You are a helpful AI voice assistant. Keep replies short, max 2 sentences. No bullet points.",
        "coach":     "You are an energetic life coach. Be motivational, direct, and inspiring. Max 2 sentences. No markdown.",
        "dev":       "You are a senior software engineer. Be technical, precise, and concise. Max 2 sentences. No markdown.",
        "creative":  "You are a wildly creative thinker. Be imaginative, playful, and surprising. Max 2 sentences. No markdown.",
    }
    current_persona = personas.get(persona_name, personas["assistant"])
    # Sync the persona change to the FastAPI server so /chat endpoint calls
    # made through the server also use the updated persona.
    requests.post(f"{BASE}/configure", json={"persona": persona_name})
    print(f"Persona set to: {persona_name}")


def live_transcribe():
    """
    Main entry point for the real-time voice agent loop.

    Opens a PyAudio input stream, connects to Deepgram's streaming STT
    WebSocket, and runs two concurrent threads:
        - send_audio (daemon): continuously reads microphone chunks and
          forwards them to Deepgram over the WebSocket.
        - main thread: blocks on conn.recv(), dispatching each finalised
          transcript to handle_transcript in its own daemon thread.

    Graceful shutdown on Ctrl+C: sends a close-stream signal to Deepgram,
    then tears down the PyAudio stream and PortAudio context.
    """
    p = pyaudio.PyAudio()
    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK
    )

    print("=" * 50)
    print("FULL VOICE AGENT RUNNING")
    print("Personas: assistant / coach / dev / creative")
    print("Speak → AI transcribes → AI thinks → AI replies in voice")
    print("Press Ctrl+C to stop")
    print("=" * 50)

    # Set the initial persona before opening the Deepgram WebSocket so the
    # first transcript is handled with the correct system prompt.
    set_persona("assistant")

    with dg.listen.v1.connect(
        model="nova-2",          # Best-accuracy Deepgram STT model
        encoding="linear16",     # Must match FORMAT=paInt16 above
        sample_rate=RATE,        # Must match RATE=16000 above
        smart_format=True,       # Auto-punctuation and numeral formatting
    ) as conn:

        def send_audio():
            """
            Daemon thread: continuously reads raw PCM frames from the
            microphone and sends them to the Deepgram WebSocket.

            exception_on_overflow=False suppresses PyAudio buffer overflow
            errors that can occur if the main thread is slow to recv() —
            audio chunks are silently dropped rather than raising an exception
            that would kill the capture thread.

            The bare except swallows all exceptions (including stream close)
            so the thread exits cleanly when the WebSocket connection is torn down.
            """
            try:
                while True:
                    audio_chunk = stream.read(CHUNK, exception_on_overflow=False)
                    conn.send_media(audio_chunk)
            except Exception:
                pass

        # Start audio capture as a daemon thread so it is automatically
        # killed when the main process exits (no explicit join needed).
        t = threading.Thread(target=send_audio, daemon=True)
        t.start()

        try:
            while True:
                # Block until Deepgram sends the next event over the WebSocket.
                result = conn.recv()

                if isinstance(result, ListenV1Results):
                    transcript = result.channel.alternatives[0].transcript

                    # is_final vs speech_final:
                    #   is_final=True fires as soon as Deepgram has processed
                    #   the current audio chunk — low latency, may occasionally
                    #   produce a partial sentence if the speaker pauses mid-thought.
                    #   speech_final=True fires only after Deepgram detects an
                    #   end-of-utterance silence — higher accuracy but adds
                    #   ~300–500ms of perceived latency. is_final is preferred
                    #   here to keep the voice agent feeling responsive.
                    is_final = result.is_final

                    if transcript and is_final:
                        # Dispatch to a new daemon thread so LLM + TTS processing
                        # never blocks the recv() loop — the agent stays responsive
                        # to new speech even while a previous reply is being generated.
                        threading.Thread(
                            target=handle_transcript,
                            args=(transcript,),
                            daemon=True
                        ).start()

        except KeyboardInterrupt:
            print("\nStopped.")
            # Gracefully close the Deepgram WebSocket before tearing down PyAudio.
            # Skipping this can leave the connection in a half-open state and
            # cause the next run to fail until the server-side timeout expires.
            conn.send_close_stream()

    # Tear down PyAudio resources in order: stop stream → close stream → terminate PortAudio.
    # All three calls are needed — terminate() alone does not close open streams.
    stream.stop_stream()
    stream.close()
    p.terminate()


# Script entry point — runs the live agent directly without asyncio.run()
# because the Deepgram v3 SDK WebSocket client is synchronous.
live_transcribe()