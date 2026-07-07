"""
Authentication Core — Email OTP (SMTP) + Google Sign-In, unified under a
single citizen verification token.

Two independent ways to get verified, same output:
  A) Email OTP
       1. POST /send-otp    -> emails a code to the address via SMTP.
       2. POST /verify-otp  -> confirms the code. On success, mints a
          short-lived signed token binding that (lowercased, trimmed)
          email address.
  B) Google Sign-In
       1. Frontend runs Google Identity Services, gets back a Google ID
          token (a JWT signed BY GOOGLE, not by us).
       2. POST /google-login sends that token here. We verify it against
          Google's public keys (signature, expiry, audience == our
          Client ID), extract the Google-verified email from it, and
          mint the SAME kind of token as path A.

Either way, the citizen-facing client stores the resulting token and
sends it as a bearer token on POST /api/reports. reports.py verifies the
token and reads the identity (email) OUT OF the token — never out of a
raw form field — so there's no path where an unverified email ends up
in notified_citizens.

This intentionally does NOT implement refresh tokens / long-lived
sessions. The access token is single-tier and expires after
VERIFICATION_TOKEN_EXPIRE_MINUTES; the citizen re-verifies (by OTP or by
Google) again after that. A refresh-token system is a legitimate
follow-up but is a separate piece of infrastructure (rotation,
revocation, a sessions store) and isn't bundled in here.

WHY EMAIL INSTEAD OF PHONE: fewer citizens are willing to hand over a
phone number to an unfamiliar municipal app, and Google Sign-In gives
people who'd rather not type anything at all a one-tap option. Both
paths still produce a verified, real-world-linked identity — this
isn't a weaker guarantee than phone OTP, just a different one.

--- TEAM BYPASS (hackathon-only) ---
A THIRD lane, checked before either SMTP branch in both send_otp_token
and verify_otp_token: if the normalized email is in
settings.TEAM_BYPASS_EMAIL_SET, the flow uses settings.TEAM_BYPASS_CODE
instead of touching real SMTP or the shared _MOCK_OTP_CODE. This is
deliberately a SEPARATE code from _MOCK_OTP_CODE ("123456") — that value
is hardcoded in this file and is effectively public, so it can't be the
thing gating access for a specific allowlist. Both TEAM_BYPASS_EMAILS
and TEAM_BYPASS_CODE default to empty in config.py, so this entire lane
is inert unless explicitly configured — remove both from .env before a
real deployment.
"""
import logging
import random
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import jwt
from fastapi import APIRouter, Body, Form, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Dev-only fallback signing key. Only ever used when JWT_SECRET_KEY is
# unset (settings.JWT_MOCK_MODE), which main.py loudly warns about on
# startup. This value being guessable is FINE in that mode because mock
# mode is meant for local/demo use only — it must never be true against
# real citizen data. See settings.JWT_MOCK_MODE docstring in config.py.
_DEV_FALLBACK_SECRET = "dev-only-insecure-key-do-not-use-in-production"

# Fixed demo code used ONLY when SMTP_MOCK_MODE is true (no SMTP creds
# configured) — mirrors the old Twilio "123456" hackathon backdoor so
# local dev / demoing without real credentials still works end to end.
# TREAT THIS VALUE AS PUBLIC: it's hardcoded here in source. It is NOT
# what gates the team bypass below — that uses settings.TEAM_BYPASS_CODE,
# a separate value you set yourself in .env.
_MOCK_OTP_CODE = "123456"

# In-memory OTP store: normalized_email -> (code, expires_at).
# PROTOTYPE-ONLY. This resets on every server restart/redeploy and
# won't work across multiple server instances (e.g. autoscaled Cloud
# Run with >1 running container) since each instance has its own copy.
# Fine for a hackathon demo on a single instance; a real deployment
# should move this into Firestore or Redis with a TTL.
_otp_store: dict[str, tuple[str, datetime]] = {}

_OTP_EXPIRE_MINUTES = 10

_bearer_scheme = HTTPBearer()


def normalize_email(email: str) -> str:
    """
    Single source of truth for email normalization. Both send-otp and
    verify-otp must normalize identically, since the *normalized* address
    is what gets embedded in the verification token — if the two paths
    normalized differently, the same citizen could end up represented as
    two different identities.

    Lowercasing is safe for the domain part always, and for the local
    part in the overwhelming majority of real-world providers (Gmail,
    Outlook, etc. are case-insensitive there too) — this is the same
    tradeoff most consumer apps make.

    settings.TEAM_BYPASS_EMAIL_SET normalizes its entries with this same
    strip+lower logic, so an email typed into the login form always
    matches an allowlist entry regardless of casing on either side.
    """
    return email.strip().lower()


def _signing_secret() -> str:
    return _DEV_FALLBACK_SECRET if settings.JWT_MOCK_MODE else settings.JWT_SECRET_KEY


def create_verification_token(email: str) -> str:
    """
    Mints a short-lived token asserting "this email address completed
    verification recently" — either by OTP, by Google Sign-In, or by the
    team bypass lane (the token itself doesn't distinguish which; all
    three are equally trusted). Bound to a normalized email and an
    expiry — nothing else. This is a verification credential, not a
    general user-identity/session token, so it deliberately carries no
    roles, permissions, or profile data.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "email": email,
        "purpose": "citizen_report_verification",
        "iat": now,
        "exp": now + timedelta(minutes=settings.VERIFICATION_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, _signing_secret(), algorithm=settings.JWT_ALGORITHM)


def verify_verification_token(token: str) -> str:
    """
    Validates a token and returns the verified email, or raises
    HTTPException(401) if it's missing, expired, tampered with, or not a
    verification token. Callers should treat the returned email as the
    ONLY trustworthy identity for the request — never fall back to a
    client-supplied email field alongside it.
    """
    try:
        payload = jwt.decode(token, _signing_secret(), algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Verification expired. Please verify again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid verification token.")

    if payload.get("purpose") != "citizen_report_verification":
        raise HTTPException(status_code=401, detail="Invalid verification token.")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid verification token.")

    return email


def require_verified_identity(
    credentials: HTTPAuthorizationCredentials = Security(_bearer_scheme),
) -> str:
    """
    FastAPI dependency — drop this in a route's signature to require a
    valid verification token and get back the verified email address.
    Usage: email: str = Depends(require_verified_identity)
    """
    return verify_verification_token(credentials.credentials)


def _send_email(to_email: str, subject: str, body: str) -> None:
    """
    Sends a plain-text email via SMTP (blocking call — fine at hackathon
    scale; move to a background task or async SMTP client if volume
    grows). Raises on failure so callers can decide how to surface it.
    """
    message = MIMEMultipart()
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], message.as_string())


@router.post("/send-otp")
def send_otp_token(email: str = Form(...)):
    """Emails a one-time verification code to the citizen's address."""
    normalized_email = normalize_email(email)

    # --- Team bypass lane: checked FIRST, before SMTP_MOCK_MODE ---
    # This must come before the mock-mode branch below so the bypass
    # works correctly even in a real deployment where SMTP_MOCK_MODE is
    # False (real SMTP creds configured) — a teammate's email should
    # still skip real delivery in that case, not just in local/demo mode.
    if settings.TEAM_BYPASS_ENABLED and normalized_email in settings.TEAM_BYPASS_EMAIL_SET:
        logger.info("Team bypass active for %s — skipping real OTP delivery.", normalized_email)
        return {"status": "simulated", "message": "Team access — use your team code"}

    if settings.SMTP_MOCK_MODE:
        # Graceful prototype fallback if SMTP creds aren't added yet —
        # same shape as the old Twilio-offline branch.
        print(f"⚠️ SMTP offline. Simulated OTP '{_MOCK_OTP_CODE}' for: {normalized_email}")
        return {"status": "simulated", "message": "OTP sent via backup channel"}

    code = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OTP_EXPIRE_MINUTES)
    _otp_store[normalized_email] = (code, expires_at)

    try:
        _send_email(
            to_email=normalized_email,
            subject="Your Saaf Sarkar verification code",
            body=(
                f"Your verification code is: {code}\n\n"
                f"This code expires in {_OTP_EXPIRE_MINUTES} minutes. "
                "If you didn't request this, you can ignore this email."
            ),
        )
        return {"status": "success", "message": "OTP sent"}
    except Exception as e:
        # Don't leave a code in the store the citizen can never receive.
        _otp_store.pop(normalized_email, None)
        raise HTTPException(status_code=400, detail=f"Email gateway failure: {str(e)}")


@router.post("/verify-otp")
def verify_otp_token(email: str = Form(...), code: str = Form(...)):
    """
    Validates the OTP challenge. On success, mints and returns a
    verification token — this is now the ONLY way an email can become
    trusted for report submission (alongside Google Sign-In below). The
    token, not a raw email field, is what create_report() in reports.py
    accepts.
    """
    normalized_email = normalize_email(email)

    # --- Team bypass lane: checked FIRST, before SMTP_MOCK_MODE ---
    # Same ordering rationale as send_otp_token above. An allowlisted
    # email must match settings.TEAM_BYPASS_CODE specifically — it does
    # NOT fall through to accepting _MOCK_OTP_CODE ("123456") as well,
    # since that value is public and accepting it here would silently
    # widen the bypass to anyone who knows the well-known demo code.
    if settings.TEAM_BYPASS_ENABLED and normalized_email in settings.TEAM_BYPASS_EMAIL_SET:
        if code == settings.TEAM_BYPASS_CODE:
            token = create_verification_token(normalized_email)
            return {
                "status": "approved",
                "message": "Team access granted",
                "verification_token": token,
                "expires_in_minutes": settings.VERIFICATION_TOKEN_EXPIRE_MINUTES,
            }
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    if settings.SMTP_MOCK_MODE:
        # Hackathon presentation safe match backdoor
        if code == _MOCK_OTP_CODE:
            token = create_verification_token(normalized_email)
            return {
                "status": "approved",
                "message": "Access Granted",
                "verification_token": token,
                "expires_in_minutes": settings.VERIFICATION_TOKEN_EXPIRE_MINUTES,
            }
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    stored = _otp_store.get(normalized_email)
    if not stored:
        raise HTTPException(status_code=400, detail="No pending verification for this email. Request a new code.")

    stored_code, expires_at = stored
    if datetime.now(timezone.utc) > expires_at:
        _otp_store.pop(normalized_email, None)
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

    if code != stored_code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    # One-time use — remove immediately on success so it can't be replayed.
    _otp_store.pop(normalized_email, None)

    token = create_verification_token(normalized_email)
    return {
        "status": "approved",
        "message": "Authentication Successful",
        "verification_token": token,
        "expires_in_minutes": settings.VERIFICATION_TOKEN_EXPIRE_MINUTES,
    }


@router.post("/google-login")
def google_login(id_token_str: str = Body(..., embed=True, alias="id_token")):
    """
    Verifies a Google ID token (produced client-side by Google Identity
    Services — see the sample HTML page) and mints the same kind of
    verification token as the email-OTP flow.

    This call ALWAYS validates the token against Google's live public
    keys and checks aud == GOOGLE_CLIENT_ID — there is no mock-mode
    bypass here (see settings.GOOGLE_LOGIN_ENABLED docstring), because
    faking a Google identity check would defeat the point of using it.
    """
    if not settings.GOOGLE_LOGIN_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Google Sign-In is not configured on this server (GOOGLE_CLIENT_ID missing).",
        )

    try:
        claims = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        # Covers bad signature, expired token, wrong audience, malformed
        # token — verify_oauth2_token collapses all of these into ValueError.
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except google_auth_exceptions.TransportError as e:
        # Separate from ValueError: this means we couldn't even REACH
        # Google's certificate endpoint (network blip, outbound firewall
        # rule, DNS issue) — the token itself might be perfectly valid.
        # Surfacing this as 401 would be misleading (it implies the
        # citizen did something wrong); 503 correctly signals "try again,
        # this is on us" instead.
        logger.error("Could not reach Google's cert endpoint to verify token: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Could not verify Google token right now (network issue reaching Google). Please try again.",
        )

    if not claims.get("email_verified", False):
        # Google itself is telling us this email hasn't been confirmed as
        # belonging to the account — don't treat it as a verified identity.
        raise HTTPException(status_code=401, detail="Google account email is not verified.")

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Google token did not include an email.")

    normalized_email = normalize_email(email)
    token = create_verification_token(normalized_email)
    return {
        "status": "approved",
        "message": "Authentication Successful",
        "verification_token": token,
        "expires_in_minutes": settings.VERIFICATION_TOKEN_EXPIRE_MINUTES,
        "email": normalized_email,
        "name": claims.get("name"),
        "picture": claims.get("picture"),
    }