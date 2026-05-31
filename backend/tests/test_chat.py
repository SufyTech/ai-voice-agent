"""
test_chat.py

Minimal isolated smoke test for the /chat endpoint.
Sends a single text message to the LLM and prints the JSON response.

Use this script to verify the text-chat pipeline (no audio) is working
independently of STT and TTS — useful for isolating whether a bug lives
in the LLM layer or in the broader voice pipeline.

Usage:
    1. Start the FastAPI server:  uvicorn main:app --reload
    2. Run:  python test_chat.py
"""

import requests

# POST a JSON body to /chat with a simple factual question.
# json= (rather than data=) automatically:
#   - serialises the dict to a JSON string
#   - sets Content-Type: application/json on the request
# This matches the Pydantic request model the /chat endpoint expects.
response = requests.post(
    "http://localhost:8000/chat",
    json={"message": "What is the capital of India?"}
)

# .json() deserialises the response body — valid here because /chat always
# returns a structured JSON payload on both success and error paths.
print(response.json())