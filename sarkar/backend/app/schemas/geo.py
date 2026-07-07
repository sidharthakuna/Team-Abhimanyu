"""
Response schemas for /api/geo/* endpoints — same role as
app/schemas/report.py, just for the geo router.
"""
from typing import List, Optional
from pydantic import BaseModel


class PlaceNameOut(BaseModel):
    display_name: Optional[str] = None
    is_live: bool


class ForecastPointOut(BaseModel):
    time: str
    pm2_5: Optional[float] = None
    european_aqi: Optional[int] = None


class ForecastOut(BaseModel):
    points: List[ForecastPointOut]
    is_live: bool