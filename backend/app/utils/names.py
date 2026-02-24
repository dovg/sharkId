"""Harry Potter female character name suggestions for new sharks."""
from sqlalchemy.orm import Session

HP_NAMES = [
    "Hermione", "Ginny", "Luna", "Bellatrix", "Molly", "Narcissa",
    "Fleur", "Lavender", "Parvati", "Padma", "Pansy", "Cho",
    "Nymphadora", "Dolores", "Minerva", "Pomona", "Rosmerta",
    "Andromeda", "Sybill", "Charity", "Irma", "Aurora", "Marietta",
    "Romilda", "Millicent", "Daphne", "Tracey", "Hannah", "Susan",
]


def suggest_name(db: Session) -> str:
    """Return the first HP name not already used as a shark display_name."""
    from app.models.shark import Shark

    used = {row[0] for row in db.query(Shark.display_name).all()}
    for name in HP_NAMES:
        if name not in used:
            return name
    # All base names taken — append a counter
    for i in range(2, 99):
        for name in HP_NAMES:
            candidate = f"{name} {i}"
            if candidate not in used:
                return candidate
    return "Unnamed"
