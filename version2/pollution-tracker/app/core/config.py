"""
Central configuration. Everything environment-specific lives here so the
rest of the app never reads os.environ directly.

For your team: if you add a new setting (e.g. a new API key), add it here
with a sensible default, then reference `settings.YOUR_SETTING` elsewhere.
Never hardcode secrets or URLs in other files.

SECURITY NOTE: this file reads credentials from environment variables /
.env — it never contains real key material itself. The .env file (see
.env.example for the shape) is gitignored and lives only on the machine
running the app. If a real credential is ever pasted into a chat, a
ticket, a Slack message, or committed to git history, treat it as
compromised and rotate it immediately in the relevant provider console
(Firebase, Cloudinary, Google Cloud) — don't just swap the value in
.env, since the old value may still be usable until it's revoked at
the source.

MIGRATION NOTE (2026-07-04): DATABASE_URL / Postgres settings have been
removed. Firestore replaces Postgres entirely — see
app/core/database.py for the new connection setup. If you're looking for
the old Postgres config, check git history.
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Firebase / Firestore ---
    # Path to the service account JSON file (NOT the JSON content itself —
    # never put raw key material directly in .env or in this file).
    # Download from Firebase Console -> Project Settings -> Service
    # Accounts -> Generate new private key, save it OUTSIDE the repo root
    # (or somewhere already covered by .gitignore) and point this at it.
    FIREBASE_CREDENTIALS_PATH: str = "./firebase-credentials.json"
    FIREBASE_PROJECT_ID: str = ""
    # Per-call timeout for Firestore reads/writes, in seconds. See the
    # note in core/database.py's get_firestore_client() for why this
    # exists — without it, a network problem can hang a request far
    # longer than is acceptable, especially live during a demo.
    FIRESTORE_CALL_TIMEOUT_SECONDS: float = 8.0

    # --- Cloudinary (photo storage) ---
    # Set CLOUDINARY_URL as a single env var, e.g.:
    #   CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    # The cloudinary SDK reads this automatically from the environment,
    # so no separate parsing needed here — but we keep a flag to check
    # it's actually set before the app starts relying on it.
    CLOUDINARY_URL: str = ""

    # --- Gemini (image classification) ---
    # Leave blank to run in MOCK mode. When your key is ready, put it in
    # .env as GEMINI_API_KEY=... and restart the app. No code changes needed.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # --- App behavior ---
    # Radius (meters) within which two reports are considered the same
    # incident for duplicate/cluster detection.
    CLUSTER_RADIUS_METERS: float = 150.0
    # Time window (hours) within which two nearby reports are clustered.
    CLUSTER_TIME_WINDOW_HOURS: float = 72.0

    # Severity scoring weights — kept to 4 variables on purpose so it's
    # explainable in one breath during judge Q&A.
    SEVERITY_BASE_WEIGHTS: dict = {
        "garbage": 30,
        "water_pollution": 50,
        "air_pollution": 60,
        "industrial_waste": 70,
        "sewage": 55,
        "other": 25,
    }
    SEVERITY_DUPLICATE_BONUS: int = 10       # if 3+ reports in same cluster
    SEVERITY_DUPLICATE_THRESHOLD: int = 3
    SEVERITY_SENSITIVE_ZONE_BONUS: int = 15  # if near school/hospital (future use)

    # --- Air quality risk heuristic ---
    # Radius (meters) to look for recent air-quality-relevant reports
    # when computing a risk score for a given point. Deliberately wider
    # than CLUSTER_RADIUS_METERS since air pollution isn't confined to
    # a single street the way a garbage pile is.
    AIR_QUALITY_RISK_RADIUS_METERS: float = 1000.0
    # How far back to look for reports feeding the risk score.
    AIR_QUALITY_RISK_WINDOW_HOURS: float = 168.0  # 7 days
    # Score (0-100 scale, same as severity_score) at or above which we
    # surface a "consider avoiding this area" warning.
    AIR_QUALITY_RISK_WARNING_THRESHOLD: int = 60

    @field_validator("AIR_QUALITY_RISK_WINDOW_HOURS", "CLUSTER_TIME_WINDOW_HOURS")
    @classmethod
    def _must_be_positive_window(cls, v: float, info) -> float:
        # Both are used as a time-window divisor downstream (recency-weight
        # fraction-of-window-elapsed in air_quality_risk.py's
        # _recency_weight(); CLUSTER_TIME_WINDOW_HOURS similarly defines
        # the cutoff window clustering.py filters on). A value of 0 or
        # below would eventually surface as a ZeroDivisionError deep in
        # request handling — this validator catches it once, at process
        # startup, with a clear message instead.
        if v <= 0:
            raise ValueError(
                f"{info.field_name} must be greater than 0 (got {v}). "
                f"This value is used as a time-window divisor; 0 or "
                f"negative would cause a crash on first use rather than "
                f"a clean startup failure."
            )
        return v

    @property
    def GEMINI_MOCK_MODE(self) -> bool:
        return not bool(self.GEMINI_API_KEY.strip())

    @property
    def CLOUDINARY_CONFIGURED(self) -> bool:
        return bool(self.CLOUDINARY_URL.strip())

    
    # --- OpenWeatherMap (air pollution index) ---
    # Free tier key from openweathermap.org -> sign up -> API keys tab.
    # Leave blank to run this feature in MOCK mode, same pattern as
    # Gemini above (see GEMINI_MOCK_MODE / GEMINI_API_KEY).
    OPENWEATHERMAP_API_KEY: str = ""
    # Cache duration for a given lat/lng's OWM reading. OWM's underlying
    # model data doesn't change meaningfully minute-to-minute, and their
    # free tier has a call-volume cap — caching avoids burning your
    # quota on repeated calls for the same neighborhood during a demo
    # where multiple people might load the report form near each other.
    OWM_CACHE_TTL_SECONDS: float = 600.0  # 10 minutes

    @property
    def OWM_CONFIGURED(self) -> bool:
        return bool(self.OPENWEATHERMAP_API_KEY.strip())

    # --- Resolved-marker display window ---
    # How long a cluster's map marker should stay visible (green) after
    # being marked resolved, before the frontend should stop rendering
    # it entirely. See ClusterOut.seconds_since_resolved in
    # schemas/report.py — this is a frontend-enforced window, not
    # something the backend can make "disappear" on its own; the
    # frontend compares seconds_since_resolved against this value on
    # each poll/refresh.
    RESOLVED_MARKER_DISPLAY_SECONDS: float = 20.0


settings = Settings()