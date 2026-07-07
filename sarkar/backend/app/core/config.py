"""
Central configuration using standard load_dotenv format.
Reads the raw system variables explicitly using os.getenv.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 1. Locate the root directory and explicitly trigger the dotenv reader loop
# This ensures that even running inside Docker or nested execution trees, the file is loaded safely.
base_dir = Path(__file__).resolve().parent.parent.parent
env_path = base_dir / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    # --- Database Core ---
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/pollution_tracker"
    )

    # --- Gemini API Configuration Variables (Explicit os.getenv) ---
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    # --- SMTP Configuration (email OTP delivery) ---
    # Defaults assume Gmail SMTP with an App Password (not your normal
    # Gmail password — generate one at https://myaccount.google.com/apppasswords,
    # requires 2FA enabled on the account first). Any SMTP provider works
    # here (SES, SendGrid SMTP relay, Mailgun, etc.) — just point HOST/PORT
    # at it; nothing else in the codebase is Gmail-specific.
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    # The From: address citizens see. Falls back to SMTP_USERNAME since
    # most providers (Gmail included) require From: to match the
    # authenticated account anyway.
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "") or os.getenv("SMTP_USERNAME", "")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Saaf Sarkar")

    # --- Force mock mode override (testing-only) ---
    # SMTP_MOCK_MODE below normally turns on only when SMTP_USERNAME/
    # SMTP_PASSWORD are BOTH empty. That's inconvenient mid-testing: you
    # might have real (but currently broken, e.g. wrong App Password)
    # credentials sitting in .env that you don't want to delete, but you
    # still want mock mode active while you sort that out separately.
    #
    # FORCE_SMTP_MOCK, when "true", short-circuits SMTP_MOCK_MODE to True
    # regardless of what SMTP_USERNAME/SMTP_PASSWORD contain — real SMTP
    # is never attempted while this is on, so a bad password can't throw
    # send_otp_token into the Gmail 535 error path at all. Defaults to
    # "false", so leaving this out of .env changes nothing for anyone.
    #
    # Set to "false" (or delete the line) once your real SMTP credentials
    # are fixed and you want to test the real email path again.
    FORCE_SMTP_MOCK: bool = os.getenv("FORCE_SMTP_MOCK", "false").strip().lower() == "true"

    # --- Team bypass (hackathon-only, per-email OTP shortcut) ---
    # Lets a SPECIFIC allowlist of team emails skip real SMTP delivery
    # during the hackathon, without turning on SMTP_MOCK_MODE globally
    # (which would accept the well-known "123456" code from ANY email —
    # that value is hardcoded in auth.py, so it must be treated as public).
    #
    # Both default to empty, which makes this feature completely inert —
    # nobody bypasses anything until you explicitly set both variables.
    #
    # TEAM_BYPASS_EMAILS: comma-separated list, e.g.
    #   "alice@team.com,bob@team.com"
    # Normalized (lowercased + stripped) the same way as every other
    # email in this codebase, via normalize_email() in auth.py, so
    # "Alice@Team.com" in .env still matches "alice@team.com" typed
    # into the login form.
    #
    # TEAM_BYPASS_CODE: your own fixed code for the allowlisted emails
    # ONLY. Generate something only your team knows — don't reuse
    # "123456" (that's the public SMTP_MOCK_MODE fallback) and don't
    # reuse JWT_SECRET_KEY or any other credential in this file.
    # A quick way to generate one: python3 -c "import secrets; print(secrets.randbelow(900000)+100000)"
    #
    # REMOVE both of these from .env before a real deployment — this is
    # a hackathon-only convenience, not something that should exist
    # against real citizen traffic.
    TEAM_BYPASS_EMAILS: str = os.getenv("TEAM_BYPASS_EMAILS", "")
    TEAM_BYPASS_CODE: str = os.getenv("TEAM_BYPASS_CODE", "")

    # --- Google Sign-In (Google Identity Services, web) ---
    # This is the OAuth 2.0 Client ID (ends in .apps.googleusercontent.com)
    # from https://console.cloud.google.com/apis/credentials — NOT a client
    # secret. It's safe to also embed this same value in frontend JS; the
    # backend additionally re-validates the `aud` claim against it below so
    # a token minted for a *different* app's Client ID can't be replayed here.
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # --- Citizen verification token (JWT) ---
    # Deliberately a SEPARATE secret from SMTP/Google credentials. Rotating
    # your email provider password or Google Client ID (leak, compromise,
    # provider rotation) should not force-logout every citizen session, and
    # a leaked JWT secret shouldn't hand someone your actual mail account
    # or Google console access.
    # Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    JWT_ALGORITHM: str = "HS256"
    # How long a citizen stays "verified" after a successful OTP check
    # before they need to re-verify. 2 hours covers a full reporting
    # session (walk around, photograph a few sites, submit each) without
    # forcing re-verification per photo.
    VERIFICATION_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("VERIFICATION_TOKEN_EXPIRE_MINUTES", 120)
    )

    # --- App behavior Configuration Thresholds ---
    CLUSTER_RADIUS_METERS: float = float(os.getenv("CLUSTER_RADIUS_METERS", 150.0))
    CLUSTER_TIME_WINDOW_HOURS: float = float(os.getenv("CLUSTER_TIME_WINDOW_HOURS", 72.0))

    # Severity scoring indices weights
    SEVERITY_BASE_WEIGHTS: dict = {
        "garbage": 30,
        "water_pollution": 50,
        "air_pollution": 60,
        "industrial_waste": 70,
        "sewage": 55,
        "other": 25,
    }
    SEVERITY_DUPLICATE_BONUS: int = int(os.getenv("SEVERITY_DUPLICATE_BONUS", 10))
    SEVERITY_DUPLICATE_THRESHOLD: int = int(os.getenv("SEVERITY_DUPLICATE_THRESHOLD", 3))
    SEVERITY_SENSITIVE_ZONE_BONUS: int = int(os.getenv("SEVERITY_SENSITIVE_ZONE_BONUS", 15))

    @property
    def GEMINI_MOCK_MODE(self) -> bool:
        # Strip string white-spaces cleanly to verify token string existence
        return not bool(self.GEMINI_API_KEY.strip())

    @property
    def JWT_MOCK_MODE(self) -> bool:
        # If no real secret is set, auth.py falls back to an insecure
        # dev-only signing key so local/demo work isn't blocked — but this
        # must NEVER be true in anything reachable by real citizens. main.py
        # logs a loud startup warning when this is true, same as Gemini mock.
        return not bool(self.JWT_SECRET_KEY.strip())

    @property
    def SMTP_MOCK_MODE(self) -> bool:
        # If SMTP credentials aren't set, auth.py falls back to printing
        # the OTP to server logs instead of emailing it, and accepts a
        # fixed demo code — same "hackathon-safe" pattern the old Twilio
        # code used. main.py warns loudly on startup when this is true,
        # since it means NO real citizen can actually receive an email.
        #
        # FORCE_SMTP_MOCK is checked FIRST and short-circuits this to True
        # even when SMTP_USERNAME/SMTP_PASSWORD are both populated — this
        # is what lets you keep real (possibly broken) credentials sitting
        # in .env untouched while testing purely against mock mode.
        if self.FORCE_SMTP_MOCK:
            return True
        return not bool(self.SMTP_USERNAME.strip() and self.SMTP_PASSWORD.strip())

    @property
    def TEAM_BYPASS_ENABLED(self) -> bool:
        # Both pieces must be set — an allowlist with no code (or a code
        # with no allowlist) is a misconfiguration, not a partial bypass.
        return bool(self.TEAM_BYPASS_EMAILS.strip()) and bool(self.TEAM_BYPASS_CODE.strip())

    @property
    def TEAM_BYPASS_EMAIL_SET(self) -> set[str]:
        # Parsed once per access (cheap — this list is tiny) rather than
        # cached, so editing .env and restarting always picks up changes
        # without worrying about stale cached state. Normalization here
        # matches normalize_email() in auth.py exactly (strip + lower) —
        # if that function's definition ever changes, update this too.
        if not self.TEAM_BYPASS_EMAILS.strip():
            return set()
        return {
            e.strip().lower()
            for e in self.TEAM_BYPASS_EMAILS.split(",")
            if e.strip()
        }

    @property
    def GOOGLE_LOGIN_ENABLED(self) -> bool:
        # Google Sign-In requires a real Client ID to validate tokens
        # against. Unlike SMTP/JWT, there's no safe "mock mode" for this —
        # a token's signature and audience are checked against Google's
        # real infrastructure, so without a Client ID the endpoint simply
        # refuses all Google-login attempts rather than faking success.
        return bool(self.GOOGLE_CLIENT_ID.strip())

# Instantiate the custom explicit configuration utility globally
settings = Settings()