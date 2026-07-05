"""
Application entry point. Run with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Interactive API docs (auto-generated, useful for frontend team to test
endpoints without writing any UI code first): http://localhost:8000/docs

Startup eagerly initializes the Firebase app and validates Cloudinary
config, specifically so a missing credentials file or unset env var
surfaces as a clear log message at startup rather than as a confusing
error on the first request that happens to need it.
"""
import logging


import cloudinary
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.api_core import exceptions as google_api_exceptions
import httpx

from app.core.config import settings
from app.core.database import get_firestore_client
from app.routers import air_quality, geocoding, reports, verification


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Pollution Tracker API",
    description="Municipal pollution reporting workflow: detect -> assign -> verify.",
    version="0.2.0",
)

# CORS: wide open for hackathon development. If you deploy this publicly
# beyond the demo, narrow allow_origins to your actual frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router)
app.include_router(verification.router)
app.include_router(air_quality.router)
app.include_router(geocoding.router)


@app.exception_handler(google_api_exceptions.GoogleAPICallError)
async def firestore_error_handler(request: Request, exc: google_api_exceptions.GoogleAPICallError):
    """
    Catches Firestore/Google API failures (timeouts, service
    unavailable, permission errors, etc.) and returns a clean 503
    instead of a raw 500 with an internal traceback.

    Without per-call timeouts (see FIRESTORE_CALL_TIMEOUT_SECONDS in
    core/config.py) AND this handler together, a Firestore-side network
    problem could hang a request far past any reasonable wait, and even
    with the timeout added, the resulting DeadlineExceeded/
    ServiceUnavailable exception would otherwise still surface as an
    unhandled 500. Catching the shared GoogleAPICallError base class
    handles both of those cases and any other Firestore API error the
    same way, without needing to enumerate every specific subclass.
    """
    logger.error("Firestore/Google API call failed on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is temporarily unavailable. Please try again shortly."},
    )


@app.exception_handler(httpx.HTTPError)
async def upstream_http_error_handler(request: Request, exc: httpx.HTTPError):
    """
    Same idea as firestore_error_handler, but for outbound HTTP calls to
    Cloudinary (see services/cloudinary_storage.py, which uses httpx). A
    network problem reaching it should look like a 502 to the client,
    not an unhandled 500.
    """
    logger.error("Upstream HTTP call failed on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=502,
        content={"detail": "An upstream service (photo storage) is temporarily unavailable."},
    )


@app.on_event("startup")
def on_startup():
    # Firestore: eagerly initialize so a missing/misconfigured
    # credentials file fails loudly here, not on the first request.
    try:
        get_firestore_client()
        logger.info("Firestore client initialized successfully.")
    except RuntimeError as e:
        logger.error("=" * 70 + "\nFIRESTORE INIT FAILED: %s\n" + "=" * 70, e)
        # Deliberately not raising here: the app can still start and
        # serve /health and /docs, which is useful for confirming the
        # container/process itself is up even if Firestore config is
        # still being sorted out. Any endpoint that touches `db` will
        # fail per-request with a clear error until this is fixed.

    # Cloudinary reads CLOUDINARY_URL from the environment automatically,
    # but we call .config() explicitly here (rather than relying on
    # import-time auto-config) so we can check CLOUDINARY_CONFIGURED and
    # log a clear warning if it's missing, the same way GEMINI_MOCK_MODE
    # is surfaced below.
    if settings.CLOUDINARY_CONFIGURED:
        cloudinary.config(cloudinary_url=settings.CLOUDINARY_URL)
        logger.info("Cloudinary configured.")
    else:
        logger.warning(
            "=" * 70 + "\n"
            "CLOUDINARY_URL not set — photo upload/verification endpoints "
            "will fail until this is set in .env.\n" + "=" * 70
        )

    if settings.GEMINI_MOCK_MODE:
        logger.warning(
            "=" * 70 + "\n"
            "GEMINI_API_KEY not set — running in MOCK classification mode.\n"
            "The full pipeline works, but classifications are simulated.\n"
            "Get a free key at aistudio.google.com, add it to .env, restart.\n"
            + "=" * 70
        )
    else:
        logger.info("Gemini API key detected — running in REAL classification mode.")

    if not settings.OWM_CONFIGURED:
        logger.warning(
            "OPENWEATHERMAP_API_KEY not set — /api/air-quality/risk will "
            "still work, but govt_air_quality will show as unavailable. "
            "Get a free key at openweathermap.org, add it to .env, restart."
        )
    else:
        logger.info("OpenWeatherMap API key detected — govt air quality signal enabled.")


@app.get("/")
def root():
    return {
        "status": "ok",
        "classification_mode": "MOCK" if settings.GEMINI_MOCK_MODE else "LIVE",
        "cloudinary_configured": settings.CLOUDINARY_CONFIGURED,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}