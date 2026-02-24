import os
from io import BytesIO
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from PIL import Image

from classifier import find_candidates
from detector import crop_zone, detect_snout
from embedder import extract_embedding
from store import get_store

ML_CONFIDENCE_THRESHOLD = float(os.getenv("ML_CONFIDENCE_THRESHOLD", "0.5"))

app = FastAPI(title="SharkID ML Service", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml", "embeddings": get_store().count()}


@app.post("/classify")
async def classify_image(
    request: Request,
    shark_x: Optional[float] = Query(None),
    shark_y: Optional[float] = Query(None),
    shark_w: Optional[float] = Query(None),
    shark_h: Optional[float] = Query(None),
    zone_x: Optional[float] = Query(None),
    zone_y: Optional[float] = Query(None),
    zone_w: Optional[float] = Query(None),
    zone_h: Optional[float] = Query(None),
    orientation: Optional[str] = Query(None),
):
    """Accept raw image bytes; return top-5 shark candidates with scores.

    When shark/zone bbox params are supplied the user-annotated zone is used
    for embedding.  Otherwise falls back to the fixed-crop heuristic.

    Response: {"candidates": [{"shark_id": str, "display_name": str, "score": float}, ...]}
    """
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image body")

    try:
        img = Image.open(BytesIO(data))
    except Exception:
        raise HTTPException(status_code=422, detail="Cannot decode image")

    has_bbox = all(v is not None for v in [shark_x, shark_y, shark_w, shark_h,
                                            zone_x, zone_y, zone_w, zone_h])
    if has_bbox:
        region = crop_zone(
            img,
            {"x": shark_x, "y": shark_y, "w": shark_w, "h": shark_h},
            {"x": zone_x,  "y": zone_y,  "w": zone_w,  "h": zone_h},
        )
    else:
        region = detect_snout(img)

    embedding = extract_embedding(region)
    candidates = find_candidates(
        embedding, get_store(), ML_CONFIDENCE_THRESHOLD, orientation or ""
    )
    return {"candidates": candidates}


@app.post("/embeddings")
async def store_embedding(
    request: Request,
    shark_id: str = Query(...),
    display_name: str = Query(...),
    photo_id: str = Query(""),
    orientation: str = Query(""),
    shark_x: Optional[float] = Query(None),
    shark_y: Optional[float] = Query(None),
    shark_w: Optional[float] = Query(None),
    shark_h: Optional[float] = Query(None),
    zone_x: Optional[float] = Query(None),
    zone_y: Optional[float] = Query(None),
    zone_w: Optional[float] = Query(None),
    zone_h: Optional[float] = Query(None),
):
    """Accept raw image bytes; extract and store an embedding for (shark_id, photo_id).

    When bbox params are provided the annotated zone is used; otherwise falls
    back to the fixed-crop heuristic.
    """
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image body")

    try:
        img = Image.open(BytesIO(data))
    except Exception:
        raise HTTPException(status_code=422, detail="Cannot decode image")

    has_bbox = all(v is not None for v in [shark_x, shark_y, shark_w, shark_h,
                                            zone_x, zone_y, zone_w, zone_h])
    if has_bbox:
        region = crop_zone(
            img,
            {"x": shark_x, "y": shark_y, "w": shark_w, "h": shark_h},
            {"x": zone_x,  "y": zone_y,  "w": zone_w,  "h": zone_h},
        )
    else:
        region = detect_snout(img)

    embedding = extract_embedding(region)
    get_store().upsert(shark_id, display_name, embedding, photo_id, orientation)

    return {"status": "stored", "shark_id": shark_id, "embedding_dim": len(embedding)}
