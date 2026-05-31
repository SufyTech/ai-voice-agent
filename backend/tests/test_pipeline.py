"""
test_pipeline.py

Smoke test for the full server-side voice pipeline via the /voice endpoint.
A single HTTP request drives the entire STT → LLM → TTS chain on the server
and returns all three outputs:
    - X-Transcript response header  — Deepgram STT result (what the user said)
    - X-Reply response header       — Groq LLM result (what the AI replied)
    - response body (bytes)         — Deepgram TTS result (spoken MP3 audio)

Contrast with test_live_full.py which runs the same pipeline client-side.
This file tests the server's /voice handler specifically — useful for
confirming the FastAPI endpoint wires STT, LLM, and TTS together correctly.

Usage:
    1. Start the FastAPI server:  uvicorn main:app --reload
    2. Ensure test.wav exists in the same directory.
    3. Run:  python test_pipeline.py
    4. Open pipeline_output.mp3 to hear the AI's spoken response.
"""

import requests

# Upload the WAV file as multipart/form-data to the /voice endpoint.
# The tuple format ("test.wav", f, "audio/wav") sets the part's filename
# and Content-Type, which the server uses to validate the uploaded file type.
# One POST triggers the full STT → LLM → TTS pipeline on the server side.
with open("test.wav", "rb") as f:
    files = {"audio": ("test.wav", f, "audio/wav")}
    response = requests.post("http://localhost:8000/voice", files=files)

# Extract the text outputs from custom response headers.
# Headers are used (rather than a JSON body) because the response body is
# already occupied by the binary MP3 audio stream — mixing JSON metadata
# and binary audio in one body would require multipart response parsing.
# X-Transcript — the STT transcription of the uploaded audio
# X-Reply      — the LLM-generated text reply (before TTS synthesis)
transcript = response.headers.get("X-Transcript")
reply      = response.headers.get("X-Reply")

print("User said:", transcript)
print("AI replied:", reply)

# Persist the TTS audio to disk as an MP3 file.
# response.content contains the raw bytes of the Deepgram TTS output.
# Writing in "wb" (write binary) mode is required — opening in text mode
# would corrupt the binary audio data.
with open("pipeline_output.mp3", "wb") as f:
    f.write(response.content)

print("Audio saved to pipeline_output.mp3 — open and listen!")