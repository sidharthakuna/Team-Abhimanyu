"""
Environmental Analytics Engine.
"""
from fastapi import APIRouter, HTTPException, Query
from app.core.database import db
from app.services.weather import get_live_environment_reading, ATTRIBUTION_TEXT
from app.services.forecast_geocode import get_aqi_forecast, reverse_geocode  # <-- NEW IMPORT

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Demo-city fallback center (Visakhapatnam), used only if the caller doesn't
# supply live coordinates — e.g. a dashboard loading before geolocation
# resolves. Per-request lat/long should always be preferred when available.
DEFAULT_LATITUDE = 17.6868
DEFAULT_LONGITUDE = 83.2185


# =========================================================================
# EXISTING ENDPOINT — unchanged
# =========================================================================
@router.get("/global-matrix")
def get_global_matrix_stats(
    latitude: float = Query(default=DEFAULT_LATITUDE, description="Live latitude for weather/AQI lookup"),
    longitude: float = Query(default=DEFAULT_LONGITUDE, description="Live longitude for weather/AQI lookup"),
):
    """
    Live global summary: cluster counts from Firestore, plus real
    temperature/humidity/PM2.5/AQI for the given coordinates via
    Open-Meteo (CAMS). Pass the citizen's actual GPS lat/long when
    available — this is what makes the reading reflect their live
    location rather than a fixed city-wide default.
    """
    clusters_ref = db.collection("clusters").stream()

    active_hotspots = 0
    resolved_tickets = 0

    for doc in clusters_ref:
        data = doc.to_dict()
        status = data.get("status", "pending")
        if status == "resolved":
            resolved_tickets += 1
        else:
            active_hotspots += 1

    reading = get_live_environment_reading(latitude, longitude)

    return {
        "active_hotspots": active_hotspots,
        "resolved_tickets": resolved_tickets,
        "ambient_pm25": reading.pm2_5,
        "ambient_pm10": reading.pm10,
        "ambient_humidity": reading.humidity_pct,
        "ambient_temperature_c": reading.temperature_c,
        "european_aqi": reading.european_aqi,
        "is_live": reading.is_live,
        "data_source": reading.data_source,
        "attribution": ATTRIBUTION_TEXT,
    }


# =========================================================================
# EXISTING ENDPOINT — unchanged
# =========================================================================
@router.get("/fusion/{cluster_id}")
def get_sensor_fusion_matrix(cluster_id: str):
    """
    NOTE ON WHAT THIS ENDPOINT ACTUALLY IS:
    The metrics below are derived from citizen report volume using a
    formula, not from real IoT sensors or satellite feeds. Renamed from
    the original "hidden_hotspot"/"satellite_aod_index" framing to be
    explicit about this — the frontend should present this as a
    "citizen-report-derived severity estimate," not as live sensor
    telemetry. If real sensor or satellite data sources are added later,
    this is the endpoint to wire them into.
    """
    cluster_doc = db.collection("clusters").document(cluster_id).get()
    if not cluster_doc.exists:
        raise HTTPException(status_code=404, detail="Cluster not found")

    cluster = cluster_doc.to_dict()
    report_count = cluster.get("report_count", 0)

    # Simulated severity estimate derived from report volume — clearly
    # labeled as such in the response, not presented as sensor readings.
    estimated_severity_index = 120 + (report_count * 25)
    high_confidence_hotspot = report_count >= 3 and estimated_severity_index > 180

    recommended_action = (
        "Deploy Water-Mist Cannons Immediately"
        if estimated_severity_index > 200
        else "Dispatch Field Cleanup Crew"
    )

    return {
        "cluster_id": cluster_id,
        "is_simulated_estimate": True,  # explicit flag — not real sensor data
        "high_confidence_hotspot": high_confidence_hotspot,
        "metrics": {
            "ground_citizen_reports": report_count,
            "estimated_severity_index": estimated_severity_index,
        },
        "resource_deployment": {
            "recommended_assets": recommended_action,
            "urgency": "CRITICAL" if high_confidence_hotspot else "MEDIUM",
        },
        "methodology_note": (
            "Estimated from citizen report volume, not live sensor or "
            "satellite data. See global-matrix for real weather/AQI."
        ),
    }


# =========================================================================
# NEW ENDPOINT #1 — hourly AQI forecast for arbitrary coordinates
# =========================================================================
@router.get("/forecast")
def get_forecast(
    latitude: float = Query(...),
    longitude: float = Query(...),
    hours: int = Query(default=48, ge=1, le=72),
):
    """
    Hourly PM2.5 + AQI forecast for the given coordinates. Powers the
    "trending worse over the next N hours" chart on a cluster's detail
    view — the thing that turns a static report into a predictive signal.
    """
    result = get_aqi_forecast(latitude, longitude, hours)
    return {
        "points": [p._asdict() for p in result.points],
        "is_live": result.is_live,
    }


# =========================================================================
# NEW ENDPOINT #2 — reverse geocode arbitrary coordinates
# =========================================================================
@router.get("/place-name")
def get_place_name(
    latitude: float = Query(...),
    longitude: float = Query(...),
):
    """
    Reverse-geocodes coordinates into a readable place name via Nominatim.
    Used wherever the UI currently shows raw lat/long — cluster cards,
    map popups, SMS notification bodies.
    """
    result = reverse_geocode(latitude, longitude)
    if result.display_name is None:
        # Soft fallback — let the frontend show coordinates instead of
        # erroring the whole card out.
        return {"display_name": None, "is_live": False}
    return {"display_name": result.display_name, "is_live": result.is_live}


# =========================================================================
# NEW ENDPOINT #3 — forecast scoped to an existing cluster by ID
# (convenience wrapper so the frontend doesn't need to already have the
# cluster's lat/long in scope — it looks the cluster up itself)
# =========================================================================
@router.get("/forecast/cluster/{cluster_id}")
def get_forecast_for_cluster(cluster_id: str, hours: int = Query(default=48, ge=1, le=72)):
    cluster_doc = db.collection("clusters").document(cluster_id).get()
    if not cluster_doc.exists:
        raise HTTPException(status_code=404, detail="Cluster not found")
    cluster = cluster_doc.to_dict()
    result = get_aqi_forecast(cluster["latitude"], cluster["longitude"], hours)
    return {
        "points": [p._asdict() for p in result.points],
        "is_live": result.is_live,
    }

