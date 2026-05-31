"""
test_live.py

Isolated real-time streaming STT test using Deepgram's WebSocket API.
Captures microphone audio via PyAudio and prints live transcripts to stdout
as they arrive — no LLM, no TTS, no server involved.

Purpose:
    Validates the microphone → Deepgram streaming pipeline in isolation.
    Use this to confirm that PyAudio can access the microphone, the
    Deepgram WebSocket connection establishes correctly, and transcripts
    are being returned before wiring in the LLM and TTS layers.

Relationship to other test files:
    test_live.py      → STT only            (this file)
    test_live_full.py → STT + LLM + TTS     (full pipeline)

Usage:
    1. Ensure DEEPGRAM_API_KEY is set in .env
    2. Run:  python test_live.py
    3. Speak into the microphone; transcripts print in real time.
    4. Press Ctrl+C to stop.

Dependencies:
    pyaudio     — microphone capture (requires PortAudio system library)
    deepgram-sdk>=3 — streaming STT WebSocket client
"""

import os
import threading
import pyaudio
from dotenv import load_dotenv
from deepgram import DeepgramClient
from deepgram.listen.v1.types import ListenV1Results

# Load DEEPGRAM_API_KEY from .env into the process environment.
load_dotenv()

# ─── PyAudio capture constants ────────────────────────────────────────────────
# These values must match the encoding parameters passed to Deepgram's
# WebSocket connection below. A mismatch (e.g. RATE=44100 with sample_rate=16000)
# will produce garbled or empty transcripts without raising an obvious error.
CHUNK    = 1024             # Frames per PyAudio read() — ~64ms of audio at 16kHz
FORMAT   = pyaudio.paInt16  # 16-bit linear PCM — matches Deepgram encoding="linear16"
CHANNELS = 1                # Mono — Deepgram nova-2 expects single-channel input
RATE     = 16000            # 16kHz sample rate — Deepgram's recommended minimum for STT

# Module-level Deepgram client — instantiated once and reused for the
# WebSocket connection. No need to recreate per-call; the client is stateless.
dg = DeepgramClient(api_key=os.getenv("DEEPGRAM_API_KEY"))


def live_transcribe():
    """
    Opens a PyAudio microphone stream and a Deepgram streaming STT WebSocket,
    then runs two concurrent threads:
        - send_audio (daemon): reads PCM chunks from the mic and forwards
          them to Deepgram over the WebSocket.
        - main thread: blocks on conn.recv(), printing each transcript as
          Deepgram returns it.

    Shuts down cleanly on Ctrl+C by closing the WebSocket before
    tearing down PyAudio resources.
    """
    p = pyaudio.PyAudio()

    # Open the default input device as a blocking PCM stream.
    # frames_per_buffer=CHUNK controls how many frames are returned per read()
    # call — smaller values reduce latency but increase CPU overhead.
    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK
    )

    print("Listening... speak now! Press Ctrl+C to stop.")

    with dg.listen.v1.connect(
        model="nova-2",          # Deepgram's highest-accuracy general STT model
        encoding="linear16",     # Raw 16-bit PCM — must match FORMAT=paInt16 above
        sample_rate=RATE,        # Must match RATE=16000 above
        smart_format=True,       # Enables automatic punctuation and numeral formatting
    ) as conn:

        def send_audio():
            """
            Daemon thread: reads raw PCM frames from the microphone in a tight
            loop and sends them to the Deepgram WebSocket.

            exception_on_overflow=False: if the PyAudio input buffer overflows
            (e.g. the main thread is slow to recv()), audio frames are silently
            dropped rather than raising an IOError that would kill this thread.

            The bare except catches all exceptions — including the one raised
            when the WebSocket closes — allowing the thread to exit cleanly
            without printing a traceback to stdout.
            """
            # continuously read from mic and send to Deepgram
            try:
                while True:
                    audio_chunk = stream.read(CHUNK, exception_on_overflow=False)
                    conn.send_media(audio_chunk)  # send raw bytes to Deepgram WebSocket
            except Exception:
                pass

        # Start audio capture as a daemon thread so it runs concurrently with
        # the recv() loop below. daemon=True ensures the thread is automatically
        # killed when the main process exits — no explicit join or stop flag needed.
        t = threading.Thread(target=send_audio, daemon=True)
        t.start()

        try:
            while True:
                # Block until Deepgram sends the next message over the WebSocket.
                # Messages can be transcript results, metadata events, or keep-alives.
                result = conn.recv()

                # Filter to transcript results only — ignore metadata and other
                # event types that Deepgram may push (e.g. UtteranceEnd, Metadata).
                if isinstance(result, ListenV1Results):
                    transcript = result.channel.alternatives[0].transcript
                    if transcript:  # only print non-empty transcripts
                        print("You said:", transcript)

        except KeyboardInterrupt:
            print("\nStopped.")
            # Send a graceful close signal to the Deepgram WebSocket before
            # exiting the context manager. Skipping this can leave the connection
            # in a half-open state, causing the next run to fail until the
            # server-side idle timeout expires.
            conn.send_close_stream()

    # Tear down PyAudio in the correct order:
    #   stop_stream() — halts audio capture (flushes the buffer)
    #   close()       — releases the stream object
    #   terminate()   — shuts down the PortAudio library context
    # Calling only terminate() without the preceding two steps can cause
    # PortAudio to log warnings or leak resources on some platforms.
    stream.stop_stream()
    stream.close()
    p.terminate()


# Script entry point — no asyncio.run() needed; the Deepgram v3 SDK
# WebSocket client (dg.listen.v1.connect) is synchronous.
live_transcribe()