import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import reports, verification, analytics, auth  # <-- 1. ADD 'auth' TO THIS IMPORT

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Pollution Tracker API",
    description="Municipal pollution reporting workflow: detect -> assign -> verify.",
    version="0.1.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(reports.router)
app.include_router(verification.router)
app.include_router(analytics.router)
app.include_router(auth.router)  # <-- 2. ADD THIS LINE TO REGISTER THE OTP ROUTER

@app.on_event("startup")
def on_startup():
    if settings.GEMINI_MOCK_MODE:
        logger.warning("GEMINI_API_KEY not set — running in MOCK classification mode.")
    else:
        logger.info("Gemini API key detected — running in REAL classification mode.")

    if settings.JWT_MOCK_MODE:
        logger.warning(
            "JWT_SECRET_KEY not set — citizen verification tokens are being signed "
            "with a hardcoded DEV-ONLY key. This is fine for local testing but MUST "
            "NOT run this way against real citizen identities: anyone could forge "
            "a valid verification token. Set JWT_SECRET_KEY in .env before deploying."
        )
    else:
        logger.info("JWT_SECRET_KEY detected — citizen verification tokens are signed securely.")

    if settings.SMTP_MOCK_MODE:
        logger.warning(
            "SMTP_USERNAME/SMTP_PASSWORD not set — email OTPs are NOT being sent. "
            "send-otp will simulate success and verify-otp will accept the fixed "
            "demo code '123456' for ANY email address. This is fine for local "
            "testing but real citizens will never receive a code. Set SMTP_USERNAME "
            "and SMTP_PASSWORD (e.g. a Gmail App Password) in .env before deploying."
        )
    else:
        logger.info("SMTP credentials detected — email OTPs will be sent for real.")

    if settings.GOOGLE_LOGIN_ENABLED:
        logger.info("GOOGLE_CLIENT_ID detected — Google Sign-In is active.")
    else:
        logger.warning(
            "GOOGLE_CLIENT_ID not set — POST /api/auth/google-login will refuse all "
            "requests with 503 until this is set. Email OTP still works independently."
        )

@app.get("/")
def root():
    return {"status": "ok", "mode": "MOCK" if settings.GEMINI_MOCK_MODE else "LIVE", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "healthy"}