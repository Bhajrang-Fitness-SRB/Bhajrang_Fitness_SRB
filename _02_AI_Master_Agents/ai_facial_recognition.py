# Facial recognition placeholder (uses face_recognition if installed)
import cv2
import numpy as np
try:
    import face_recognition
except Exception:
    face_recognition = None


def verify_face(known_encodings, frame):
    """Return {verified: bool, confidence: float} based on frame and known_encodings."""
    if face_recognition is None:
        return {"verified": False, "confidence": 0.0, "error": "face_recognition not installed"}

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    locs = face_recognition.face_locations(rgb)
    encs = face_recognition.face_encodings(rgb, locs)
    if not encs:
        return {"verified": False, "confidence": 0.0}

    matches = face_recognition.compare_faces(known_encodings, encs[0], tolerance=0.5)
    distances = face_recognition.face_distance(known_encodings, encs[0]) if known_encodings else [1.0]
    confidence = float(1 - (distances[0] if distances else 1.0))
    return {"verified": bool(matches and matches[0]), "confidence": confidence}
