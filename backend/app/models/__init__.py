# Import all models here so that Alembic autogenerate can discover them
# and so callers can do: from app.models import User, Shark, ...

from app.models.user import User
from app.models.location import Location
from app.models.shark import Shark, NameStatus
from app.models.dive_session import DiveSession
from app.models.photo import Photo, ProcessingStatus
from app.models.observation import Observation
from app.models.video import Video, VideoStatus

__all__ = [
    "User",
    "Location",
    "Shark",
    "NameStatus",
    "DiveSession",
    "Photo",
    "ProcessingStatus",
    "Observation",
    "Video",
    "VideoStatus",
]
