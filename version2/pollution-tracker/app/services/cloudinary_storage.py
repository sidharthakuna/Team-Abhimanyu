"""
Photo storage via Cloudinary. Replaces local-disk storage entirely — no
uploads/ folder, no Docker volume management.

Two things follow from using a real CDN instead of a disk path:
1. save_photo() returns BOTH a URL (what you store and display) and a
   public_id (Cloudinary's internal handle, required to delete the asset
   later — you cannot delete a Cloudinary asset by URL alone). Both are
   stored on the Report document (see app/models/report.py).
2. read_photo() downloads bytes from the URL over HTTP instead of a
   filesystem read, since verification.py needs raw bytes of the
   ORIGINAL photo to compare against a new "after" photo, and that
   original photo lives on Cloudinary, not this server's disk.

Configuration: set CLOUDINARY_URL in .env as a single connection string:
    CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
The cloudinary SDK reads this automatically from the environment on
import — no explicit .config() call needed as long as the env var is set
before this module is imported (main.py's startup handler also calls
cloudinary.config() explicitly, belt-and-suspenders, so ordering doesn't
matter in practice).

SECURITY: CLOUDINARY_URL contains your API secret. It must only ever
live in .env (gitignored) or your deployment platform's secret manager —
never in this file, never in a chat, never committed to git. If a real
Cloudinary URL/secret is ever exposed, regenerate the API secret from the
Cloudinary dashboard immediately.
"""
import logging
import uuid

import cloudinary
import cloudinary.uploader
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Folder prefix in Cloudinary so pollution-tracker uploads are visually
# grouped and distinguishable from anything else that might use the same
# Cloudinary account (e.g. a personal account reused across projects).
_CLOUDINARY_FOLDER = "pollution-tracker"


def _check_configured() -> None:
    if not settings.CLOUDINARY_CONFIGURED:
        raise RuntimeError(
            "CLOUDINARY_URL is not set. Add it to .env as "
            "CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME "
            "(see your Cloudinary dashboard for these values)."
        )


def save_photo(file_bytes: bytes, original_filename: str) -> tuple[str, str]:
    """
    Uploads photo bytes to Cloudinary, returns (url, public_id).

    Both values must be stored by the caller — url for display,
    public_id for later deletion (delete_photo() needs it, and it
    cannot be derived back out of the URL reliably).
    """
    _check_configured()

    # Cloudinary auto-generates a public_id if we don't pass one, but we
    # set one explicitly (a fresh uuid) so we control the naming and can
    # log it predictably, rather than trusting Cloudinary's default
    # scheme not to change on us.
    public_id = f"{_CLOUDINARY_FOLDER}/{uuid.uuid4()}"

    result = cloudinary.uploader.upload(
        file_bytes,
        public_id=public_id,
        resource_type="image",
        overwrite=False,
    )

    url = result["secure_url"]
    logger.info("Uploaded photo to Cloudinary: %s", public_id)
    return url, public_id


def delete_photo(public_id: str) -> None:
    """
    Deletes a photo from Cloudinary. Safe to call even if the asset was
    already deleted or never existed — Cloudinary's destroy() returns a
    'not found' result rather than raising, so we log but don't raise
    either, matching the old behavior of delete calls being best-effort
    cleanup rather than a critical path.
    """
    _check_configured()
    result = cloudinary.uploader.destroy(public_id, resource_type="image")
    if result.get("result") not in ("ok", "not found"):
        logger.warning("Unexpected Cloudinary delete result for %s: %s", public_id, result)
    else:
        logger.info("Deleted photo from Cloudinary: %s (%s)", public_id, result.get("result"))


def read_photo(photo_url: str) -> bytes:
    """
    Downloads a previously-uploaded photo's bytes from its Cloudinary
    URL. Used by verification.py to get the ORIGINAL report's photo
    bytes for before/after comparison.

    Raises httpx.HTTPStatusError if the asset is missing (e.g. it was
    deleted from Cloudinary directly, outside this app, or the stored
    URL was ever wrong). Callers that hit this from a request (see
    routers/verification.py) should catch it and return a clean 404/409
    instead of letting FastAPI turn it into a raw 500.
    """
    response = httpx.get(photo_url, timeout=10.0)
    response.raise_for_status()
    return response.content
