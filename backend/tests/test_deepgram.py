"""
test_deepgram.py

Isolated connectivity test for the Deepgram Speech-to-Text integration.
Transcribes a known Deepgram sample audio URL and prints the result,
confirming that:
    1. The DEEPGRAM_API_KEY in .env is valid and loaded correctly.
    2. The deepgram-sdk package (v3+) is installed and importable.
    3. Network connectivity to Deepgram's API is available.

Use this before running the full pipeline to rule out Deepgram as the
source of any STT failures.

Usage:
    1. Ensure DEEPGRAM_API_KEY is set in .env
    2. Run:  python test_deepgram.py

Note on SDK version:
    This script targets the Deepgram Python SDK v3+ (package: deepgram-sdk>=3).
    The v3 SDK uses a synchronous client by default — do NOT add async/await
    here. Earlier SDK versions (v2 and below) had a different import path
    and an async-first API; if you see ImportError, check your installed version:
        pip show deepgram-sdk
"""

import asyncio  # imported but not used here — retained for potential future async expansion
import os
from dotenv import load_dotenv
from deepgram import DeepgramClient

# Load environment variables from .env so DEEPGRAM_API_KEY is available
# via os.getenv without being hard-coded in source.
load_dotenv()

def test():
    """
    Instantiate the Deepgram client and run a synchronous URL transcription.

    DeepgramClient in SDK v3 is synchronous — the transcribe_url call blocks
    until Deepgram returns the full transcription result. No event loop or
    asyncio.run() is required, unlike the v2 SDK which was async-first.
    """
    # Initialise the client with the API key from the environment.
    # Passing api_key explicitly (rather than relying on the DEEPGRAM_API_KEY
    # env var being picked up automatically) makes the auth source unambiguous.
    dg = DeepgramClient(api_key=os.getenv("DEEPGRAM_API_KEY"))

    # Transcribe a publicly hosted Deepgram sample WAV file.
    # Using a known-good URL (rather than a local file) isolates the test to
    # API key validity and network connectivity — no local audio I/O involved.
    # nova-2  → Deepgram's latest general-purpose STT model (best accuracy/speed ratio)
    # smart_format=True → enables automatic punctuation, numerals, and casing
    # No await — transcribe_url is synchronous in SDK v3; it blocks here until complete.
    response = dg.listen.v1.media.transcribe_url(
        url="https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav",
        model="nova-2",
        smart_format=True,
        language="en",
    )

    # Navigate the nested response object to extract the transcript string.
    # Path: results → channels[0] (mono audio has one channel) →
    #       alternatives[0] (highest-confidence hypothesis) → transcript
    transcript = response.results.channels[0].alternatives[0].transcript
    print("Transcript:", transcript)

# Entry point — called directly without asyncio.run() because the SDK v3
# client and this test function are fully synchronous.
test()