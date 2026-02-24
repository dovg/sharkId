from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, dive_sessions, locations, observations, photos, sharks, videos

app = FastAPI(title="SharkID API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(locations.router)
app.include_router(dive_sessions.router)
app.include_router(photos.router)   # registers /dive-sessions/{id}/photos, /photos/*
app.include_router(sharks.router)
app.include_router(observations.router)
app.include_router(videos.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "backend"}
