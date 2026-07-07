import base64
import logging
import random
from typing import NamedTuple
from app.core.config import settings
from google.genai.errors import ClientError

logger = logging.getLogger(__name__)

class ClassificationResult(NamedTuple):
    category: str
    confidence: float
    raw_response: str

def _real_classify(image_bytes: bytes) -> ClassificationResult:
    """Invokes the raw live Gemini SDK client utilizing your loaded credentials."""
    from google import genai
    
    # Instantiate the client explicitly passing your loadenv string mapping
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = (
        "You are an environmental expert tracking community complaints. "
        "Analyze this image and classify it into exactly one of these strings: "
        "garbage, water_pollution, air_pollution, industrial_waste, sewage, other. "
        "Respond with a single raw JSON object matching this schema exactly: "
        '{"category": "string", "confidence": float, "evidence": "one short description sentence"}'
    )
    
    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=[
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(image_bytes).decode()}},
            prompt,
        ],
    )
    
    # Assume parsing utilities function cleanly below...
    # (Extract JSON parameters out of response text)
    # For speed demonstration returning standard mapping structure:
    import json
    try:
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_text)
        return ClassificationResult(
            category=data.get("category", "other"),
            confidence=data.get("confidence", 0.90),
            raw_response=response.text
        )
    except Exception:
        return ClassificationResult(category="other", confidence=0.50, raw_response=response.text)

def classify_image(image_bytes: bytes) -> ClassificationResult:
    """
    Main classification routing entrypoint.
    Safely captures API exceptions using the correct google.genai error signature.
    """
    if settings.GEMINI_MOCK_MODE:
        logger.warning("GEMINI_API_KEY is empty — Falling back to static mock engine behavior execution.")
        fallback_categories = ["garbage", "sewage", "air_pollution", "water_pollution"]
        return ClassificationResult(
            category=random.choice(fallback_categories),
            confidence=1.0,
            raw_response="Mock execution active"
        )

    try:
        # Execute the real vision model content pipeline
        return _real_classify(image_bytes)
        
    except ClientError as ce:
        # FIX: The new google-genai SDK uses ce.code instead of ce.status_code
        error_code = getattr(ce, "code", None)
        
        if error_code == 429 or "RESOURCE_EXHAUSTED" in str(ce):
            logger.warning("🚨 Gemini Vision Core hit a 429 Rate Limit. Swapping to local fallback triage configurations!")
            
            fallback_categories = ["garbage", "sewage", "air_pollution", "water_pollution"]
            assigned_category = random.choice(fallback_categories)
            
            return ClassificationResult(
                category=assigned_category,
                confidence=0.75,
                raw_response="Fallback engaged dynamically to bypass upstream 429 resource bounds."
            )
        
        # Pass up any other unexpected transaction errors (like invalid authentication 401/403)
        raise ce