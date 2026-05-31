"""
test_transcribe.py

Minimal isolated smoke test for the /transcribe endpoint.
Sends a single WAV file to the STT service and prints the raw HTTP
response — intentionally bypassing .json() so that malformed or
non-JSON error responses are still fully visible.

Use this script when debugging STT issues in isolation, without
running the full pipeline (STT → LLM → TTS) that test_api.py exercises.

Usage:
    1. Start the FastAPI server:  uvicorn main:app --reload
    2. Ensure test.wav exists in the same directory.
    3. Run:  python test_transcribe.py

Why .text instead of .json():
    If Deepgram is misconfigured, the API key is invalid, or the server
    raises an unhandled exception, the response body may be plain text or
    an HTML error page rather than valid JSON. Calling .json() in those
    cases raises a JSONDecodeError and hides the actual error message.
    Printing .text always succeeds and shows the full server response,
    making the root cause immediately visible.
"""

import requests

# Open the test WAV file in binary mode and POST it as multipart/form-data.
# The tuple format ("test.wav", f, "audio/wav") sets the filename and
# Content-Type on the file part, matching what the /transcribe endpoint expects.
with open("test.wav", "rb") as f:
    files = {"audio": ("test.wav", f, "audio/wav")}
    response = requests.post("http://localhost:8000/transcribe", files=files)

# Print status code first — a non-200 here immediately signals whether
# the failure is at the HTTP layer (routing, auth) or inside the handler.
print("Status code:", response.status_code)

# Print raw response text rather than calling .json() so that any
# error payload (plain text, HTML, partial JSON) is visible as-is.
# See module docstring for the full rationale.
print("Raw response:", response.text)