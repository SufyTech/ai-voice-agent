import os, io
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from deepgram import DeepgramClient
from groq import Groq
from pydantic import BaseModel

load_dotenv()
app = FastAPI()
app.add_middleware(
    CORSMiddleware, 
    allow_origins=[
        "http://localhost:5173",
        "https://ai-voice-agent-roan.vercel.app",
        "https://*.vercel.app"
    ], 
    allow_methods=["*"], 
    allow_headers=["*"], 
    expose_headers=["X-Transcript","X-Reply","X-Warning"]
)
dg = DeepgramClient(api_key=os.getenv("DEEPGRAM_API_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

PERSONAS = {
  "assistant": "You are a helpful AI voice assistant. Keep replies short - maximum 2 sentences. Never use bullet points or markdown.",
  "coach":     "You are an energetic life coach. Be motivational, direct, and inspiring. Maximum 2 sentences. No markdown.",
  "dev":       "You are a senior software engineer. Be technical, precise, and concise. Maximum 2 sentences. No markdown.",
  "creative":  "You are a wildly creative thinker. Be imaginative, playful, and surprising. Maximum 2 sentences. No markdown.",
}

conversation_history = [{"role": "system", "content": PERSONAS["assistant"]}]
ai_is_speaking = False

class ChatRequest(BaseModel): message: str
class SpeakRequest(BaseModel): text: str
class ConfigureRequest(BaseModel): persona: str

@app.get("/")
def root(): return {"status": "Voice Agent API is running"}

@app.get("/status")
def status(): return {"ai_is_speaking": ai_is_speaking, "conversation_length": len(conversation_history)}

@app.post("/reset")
def reset():
  global conversation_history
  conversation_history = [{"role": "system", "content": PERSONAS["assistant"]}]
  return {"status": "reset"}

@app.post("/configure")
def configure(request: ConfigureRequest):
  global conversation_history
  conversation_history[0] = {"role": "system", "content": PERSONAS.get(request.persona, PERSONAS["assistant"])}
  return {"status": "configured", "persona": request.persona}

@app.post("/interrupt")
def interrupt():
  global ai_is_speaking
  ai_is_speaking = False
  return {"status": "interrupted"}

@app.post("/voice")
def voice_pipeline(audio: UploadFile = File(...)):
  global ai_is_speaking
  try:
    audio_bytes = audio.file.read()
    if len(audio_bytes) < 500:
      raise HTTPException(status_code=400, detail="Audio too short.")

    stt = dg.listen.v1.media.transcribe_file(request=audio_bytes, model="nova-2", smart_format=True, language="en")
    transcript = stt.results.channels[0].alternatives[0].transcript

    if not transcript.strip():
      return StreamingResponse(io.BytesIO(b""), media_type="audio/mpeg", headers={"X-Transcript":"","X-Reply":"","X-Warning":"No speech detected"})

    conversation_history.append({"role": "user", "content": transcript})
    groq_resp = groq_client.chat.completions.create(model="llama-3.1-8b-instant", messages=conversation_history, max_tokens=80, temperature=0.7)
    reply = groq_resp.choices[0].message.content
    conversation_history.append({"role": "assistant", "content": reply})
    ai_is_speaking = True

    def stream():
      global ai_is_speaking
      try:
        for chunk in dg.speak.v1.audio.generate(text=reply, model="aura-asteria-en", encoding="mp3"):
          if not ai_is_speaking: break
          yield chunk
      finally:
        ai_is_speaking = False

    return StreamingResponse(stream(), media_type="audio/mpeg", headers={"X-Transcript": transcript, "X-Reply": reply})

  except HTTPException: raise
  except Exception as e:
    ai_is_speaking = False
    raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend is awake"}