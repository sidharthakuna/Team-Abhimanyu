"""
Firestore client setup. This is the ONLY file that should initialize the
Firebase app or create a Firestore client directly — everywhere else, use
the `get_db` dependency below.

MIGRATION NOTE (2026-07-04): this replaces the old SQLAlchemy
engine/session setup. There is no schema migration to run — Firestore is
schemaless, collections and documents are created the first time you
write to them. See app/models/report.py for the new
"model" layer (thin dataclass-based wrappers instead of SQLAlchemy ORM
classes) and app/services/firestore_repo.py for read/write helpers.

Why a dependency function at all, if Firestore doesn't need per-request
sessions the way SQL connections do? Two reasons:
1. Keeps the router code's shape (`db: Client = Depends(get_db)`)
   unchanged, so this migration doesn't ripple into every router file.
2. Gives us one place to swap in a test double / emulator client later
   without touching routers or services.
"""
import logging

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings

logger = logging.getLogger(__name__)

_app: firebase_admin.App | None = None
_client: firestore.Client | None = None


def _init_firebase() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app

    try:
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
    except FileNotFoundError as e:
        raise RuntimeError(
            f"Firebase credentials file not found at "
            f"'{settings.FIREBASE_CREDENTIALS_PATH}'. Download a service "
            f"account key from Firebase Console -> Project Settings -> "
            f"Service Accounts -> Generate new private key, save it "
            f"somewhere OUTSIDE version control, and set "
            f"FIREBASE_CREDENTIALS_PATH in .env to point at it."
        ) from e
    except ValueError as e:
        # Firebase's Certificate() raises plain ValueError (not a
        # FileNotFoundError) both when the JSON is malformed/incomplete
        # AND when the private_key field itself doesn't parse as a valid
        # PEM key — e.g. the file was truncated during copy/paste, saved
        # with the wrong line endings, or is a placeholder/corrupted key.
        # A file that exists and is valid JSON can still fail here for
        # reasons that have nothing to do with the file being "not found."
        raise RuntimeError(
            f"Firebase credentials file at '{settings.FIREBASE_CREDENTIALS_PATH}' "
            f"exists but could not be parsed as valid service account "
            f"credentials ({e}). This usually means the JSON is incomplete, "
            f"was corrupted during copy/paste (check for missing characters "
            f"or altered line breaks in the private_key field), or is a "
            f"placeholder rather than a real downloaded key. Try "
            f"re-downloading a fresh key from Firebase Console -> Project "
            f"Settings -> Service Accounts -> Generate new private key."
        ) from e

    init_kwargs = {}
    if settings.FIREBASE_PROJECT_ID:
        init_kwargs["projectId"] = settings.FIREBASE_PROJECT_ID

    _app = firebase_admin.initialize_app(cred, init_kwargs)
    logger.info("Firebase app initialized (project=%s)", settings.FIREBASE_PROJECT_ID or "from credentials file")
    return _app


def get_firestore_client() -> firestore.Client:
    """
    Returns the shared Firestore client, initializing Firebase on first
    call. Safe to call repeatedly — subsequent calls reuse the same app
    and client instance.

    Note on timeouts: the underlying google-cloud-firestore client uses
    gRPC, which by default retries transient failures with a backoff
    policy tuned for production reliability over fast failure. A network
    problem (or a proxy that can't complete the TLS handshake to
    Google's servers at all) can cause requests to hang for many seconds
    rather than erroring immediately. FIRESTORE_CALL_TIMEOUT_SECONDS
    bounds that: every read/write call in firestore_repo.py should pass
    `timeout=settings.FIRESTORE_CALL_TIMEOUT_SECONDS` explicitly (the SDK
    does not apply a short default on its own). This trades a small
    amount of resilience to genuinely slow-but-eventually-successful
    calls for a much better failure mode during a live demo: a clear
    503 in a few seconds beats a request that never comes back.

    Known limitation: this timeout bounds the logical RPC deadline once a
    connection exists. A failure at the transport/TLS handshake layer
    itself (e.g. a network that can't reach googleapis.com at all) hits
    gRPC's own lower-level channel retry/backoff, which sits underneath
    where this timeout applies. That's not fixable from this layer; it
    would only show up in a broken network environment, not in a normal
    deployment with real internet access to Google's servers.
    """
    global _client
    if _client is None:
        _init_firebase()
        _client = firestore.client()
    return _client


def get_db():
    """
    FastAPI dependency. Use it in routers like:

        @router.get("/reports")
        def list_reports(db: firestore.Client = Depends(get_db)):
            ...

    Unlike the old SQLAlchemy version, there's no per-request session to
    close — Firestore's client manages its own connection pooling
    internally. This function stays a generator (rather than returning
    the client directly) purely so the `Depends(get_db)` call-site syntax
    in routers doesn't need to change.
    """
    yield get_firestore_client()
