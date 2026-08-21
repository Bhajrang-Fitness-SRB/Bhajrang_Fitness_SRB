import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

try:
    import face_recognition
except ImportError:
    face_recognition = None
    logger.warning("face_recognition library not installed. AI vision offline.")

def verify_face(known_encodings: list, frame: np.ndarray) -> dict:
    """
    Compares a video frame against a list of known face encodings.
    """
    if face_recognition is None:
        return {"verified": False, "confidence": 0.0, "error": "library_missing"}

    if not known_encodings:
        return {"verified": False, "confidence": 0.0, "error": "no_known_encodings"}

    try:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locs = face_recognition.face_locations(rgb)
        encs = face_recognition.face_encodings(rgb, locs)
        
        if not encs:
            return {"verified": False, "confidence": 0.0, "error": "no_face_detected"}

        # Compare the first face found in the camera frame against all known member encodings
        unknown_face_encoding = encs[0]
        matches = face_recognition.compare_faces(known_encodings, unknown_face_encoding, tolerance=0.5)
        
        if any(matches):
            # Find the best match among the known encodings
            face_distances = face_recognition.face_distance(known_encodings, unknown_face_encoding)
            best_match_index = np.argmin(face_distances)
            confidence = float(1 - face_distances[best_match_index])
            
            return {
                "verified": True, 
                "confidence": confidence,
                "match_index": int(best_match_index)
            }
            
        return {"verified": False, "confidence": 0.0}
        
    except Exception as e:
        logger.exception(f"Facial recognition error: {e}")
        return {"verified": False, "confidence": 0.0, "error": str(e)}
