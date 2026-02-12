# gcp_auth_firestore.py
import os
from typing import Optional, Dict, Any

import firebase_admin
from firebase_admin import auth as fb_auth, credentials
from google.cloud import firestore

_app = None
_db = None

def init_firebase_admin():
    """
    Uses Application Default Credentials on GCP (Cloud Run/VM).
    Locally you can set GOOGLE_APPLICATION_CREDENTIALS to a service account json.
    """
    global _app
    if _app is not None:
        return _app

    # ADC works on GCP automatically. If running locally with SA JSON, ADC also works.
    _app = firebase_admin.initialize_app(credentials.ApplicationDefault())
    return _app

def get_db():
    global _db
    if _db is not None:
        return _db
    _db = firestore.Client()
    return _db

def verify_bearer_token(auth_header: str) -> Optional[Dict[str, Any]]:
    """
    Returns decoded token dict if valid, else None.
    """
    if not auth_header:
        return None
    parts = auth_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None

    try:
        decoded = fb_auth.verify_id_token(token)
        return decoded
    except Exception:
        return None

def auth_optional_enabled() -> bool:
    """
    Default: auth optional (so we don't break current flows).
    Set GAIA_REQUIRE_AUTH=1 in prod to force auth.
    """
    return os.environ.get("GAIA_REQUIRE_AUTH", "").strip() not in ("1", "true", "yes")

def ensure_user_doc(uid: str, email: str = "", name: str = ""):
    db = get_db()
    ref = db.collection("users").document(uid)
    snap = ref.get()
    if snap.exists:
        # update lastLoginAt lightweight
        ref.set({"lastLoginAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return
    ref.set({
        "email": email or "",
        "name": name or "",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "lastLoginAt": firestore.SERVER_TIMESTAMP,
        "plan": "free",
        "status": "active",
    }, merge=True)
