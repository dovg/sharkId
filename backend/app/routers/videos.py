import base64
import uuid
from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import SessionLocal, get_db
from app.models.dive_session import DiveSession
from app.models.photo import Photo, ProcessingStatus
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.schemas.video import VideoOut
from app.storage.minio import delete_file, upload_file

router = APIRouter(tags=["videos"])

ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/avi",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
}

# 500 MB hard limit
MAX_VIDEO_BYTES = 500 * 1024 * 1024


# ── background task ───────────────────────────────────────────────────────────

def _process_video(video_id: UUID) -> None:
    """Download video from MinIO, call ML /process-video, create Photo records."""
    # Import here to avoid circular import at module load time
    from app.routers.photos import _classify_photo

    db = SessionLocal()
    try:
        video = db.get(Video, video_id)
        if not video:
            return

        video.processing_status = VideoStatus.processing
        db.commit()

        # Download video from MinIO
        from app.storage.minio import _client
        s3 = _client()
        obj = s3.get_object(Bucket=settings.minio_bucket, Key=video.object_key)
        video_data = obj["Body"].read()

        # Call ML service — long timeout: processing a full video takes time
        with httpx.Client(timeout=300.0) as http:
            resp = http.post(
                f"{settings.ml_service_url}/process-video",
                content=video_data,
                headers={"Content-Type": video.content_type},
            )
            resp.raise_for_status()
            frames = resp.json().get("frames", [])

        # Create a Photo record for each detected frame
        count = 0
        for frame in frames:
            jpeg_bytes = base64.b64decode(frame["jpeg"])
            photo_id = uuid.uuid4()
            object_key = f"photos/{video.dive_session_id}/{photo_id}.jpg"

            upload_file(jpeg_bytes, object_key, "image/jpeg")

            photo = Photo(
                id=photo_id,
                object_key=object_key,
                content_type="image/jpeg",
                size=len(jpeg_bytes),
                dive_session_id=video.dive_session_id,
                shark_bbox=frame["shark_bbox"],
                zone_bbox=frame["zone_bbox"],
                auto_detected=True,
                processing_status=ProcessingStatus.processing,
            )
            db.add(photo)
            db.commit()
            db.refresh(photo)

            # Classify the frame (uses the auto-detected bboxes)
            try:
                _classify_photo(photo.id)
            except Exception:
                pass  # classification failure is non-fatal; photo stays in processing

            count += 1

        video.frames_extracted = count
        video.processing_status = VideoStatus.done
        db.commit()

    except Exception:
        db.rollback()
        try:
            video = db.get(Video, video_id)
            if video:
                video.processing_status = VideoStatus.error
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ── routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/dive-sessions/{session_id}/videos",
    response_model=VideoOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_video(
    session_id: UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not db.get(DiveSession, session_id):
        raise HTTPException(status_code=404, detail="Dive session not found")

    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported format. Use MP4, MOV, AVI, MKV, or WebM.",
        )

    data = await file.read()
    if len(data) > MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds the {MAX_VIDEO_BYTES // 1024 // 1024} MB limit.",
        )

    # Derive storage extension from MIME type
    ext_map = {
        "video/mp4": "mp4", "video/quicktime": "mov",
        "video/avi": "avi", "video/x-msvideo": "avi",
        "video/x-matroska": "mkv", "video/webm": "webm",
    }
    ext = ext_map.get(file.content_type, "mp4")
    video_id = uuid.uuid4()
    object_key = f"videos/{session_id}/{video_id}.{ext}"

    upload_file(data, object_key, file.content_type)

    video = Video(
        id=video_id,
        object_key=object_key,
        content_type=file.content_type,
        size=len(data),
        dive_session_id=session_id,
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    background_tasks.add_task(_process_video, video.id)

    return VideoOut.model_validate(video)


@router.delete(
    "/dive-sessions/{session_id}/videos/{video_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_video(
    session_id: UUID,
    video_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    video = db.get(Video, video_id)
    if not video or video.dive_session_id != session_id:
        raise HTTPException(status_code=404, detail="Video not found")
    try:
        delete_file(video.object_key)
    except Exception:
        pass
    db.delete(video)
    db.commit()


@router.get("/dive-sessions/{session_id}/videos", response_model=List[VideoOut])
def list_videos(
    session_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(Video)
        .filter(Video.dive_session_id == session_id)
        .order_by(Video.uploaded_at.desc())
        .all()
    )
