"""
test_tts.py

Isolated connectivity test for the Deepgram Text-to-Speech integration.
Synthesises a hardcoded sentence to an MP3 file, confirming that:
    1. The DEEPGRAM_API_KEY in .env is valid and has TTS access.
    2. The deepgram-sdk>=3 Speak API is importable and reachable.
    3. The aura-asteria-en voice model is available on the account.
    4. Audio bytes are returned and can be written to disk successfully.

Use this before running the full pipeline to rule out TTS as the source
of any audio generation failures.

Usage:
    1. Ensure DEEPGRAM_API_KEY is set in .env
    2. Run:  python test_tts.py
    3. Open test_output.mp3 to hear the synthesised audio.

Deepgram Speak API note:
    dg.speak.v1.audio.generate() returns a lazy iterator of byte chunks,
    not a single bytes object. The chunks must be joined before writing to
    disk or streaming to a client. The iterator is consumed in one pass —
    iterating it a second time yields nothing.
"""

import os
from dotenv import load_dotenv
from deepgram import DeepgramClient

# Load DEEPGRAM_API_KEY from .env into the process environment.
load_dotenv()

# Module-level Deepgram client — stateless, safe to reuse across calls.
dg = DeepgramClient(api_key=os.getenv("DEEPGRAM_API_KEY"))

# Request TTS synthesis from the Deepgram Aura model.
#
# model="aura-asteria-en":
#   Deepgram's default English female neural voice. Chosen for its natural
#   prosody and low latency — well-suited for conversational voice agents.
#   Other available voices: aura-luna-en, aura-stella-en, aura-orion-en, etc.
#
# encoding="mp3":
#   Compressed audio format. Smaller payload than WAV or linear16, which
#   matters when streaming audio over the network to a client.
#   Use encoding="linear16" if downstream processing requires raw PCM.
#
# Returns an iterator of bytes chunks — NOT a single bytes object.
# The iterator is lazy; audio data is yielded as it streams from Deepgram.
audio_iterator = dg.speak.v1.audio.generate(
    text="Hello! I am your AI voice assistant. How can I help you today?",
    model="aura-asteria-en",
    encoding="mp3",
)

# Materialise the full audio by joining all streamed chunks into one bytes object.
# b"".join() is the idiomatic pattern for consuming a bytes iterator efficiently —
# it avoids repeated string concatenation (which would create a new object per chunk).
# Note: the iterator is consumed here; iterating audio_iterator again yields nothing.
audio_bytes = b"".join(audio_iterator)

# Write the synthesised audio to disk in binary mode.
# "wb" is required — opening in text mode would corrupt the binary MP3 data.
with open("test_output.mp3", "wb") as f:
    f.write(audio_bytes)

print("Done! Open test_output.mp3 and listen.")