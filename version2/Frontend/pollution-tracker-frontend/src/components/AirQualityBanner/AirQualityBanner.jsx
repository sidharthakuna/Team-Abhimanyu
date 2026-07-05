// Shows CombinedAirQualityOut's two signals SIDE BY SIDE, never
// blended into one number — this mirrors the backend's own explicit
// design intent (see air_quality_risk.py's module docstring: "why is
// this number X should always have exactly one cause").

import "./AirQualityBanner.css";

export function AirQualityBanner({ data }) {
  if (!data) return null;

  const { citizen_report_risk: citizen, govt_air_quality: govt } = data;

  if (!citizen.should_warn && (!govt || !govt.available || govt.approx_cpcb_style_score < 50)) {
    return null; // nothing worth surfacing — stay quiet rather than show a low-risk banner nobody needs
  }

  return (
    <div className="air-banner">
      <div className="air-banner__header">
        <span aria-hidden="true">🌫️</span>
        <span>Air quality near this location</span>
      </div>

      <div className="air-banner__signals">
        <div className={`air-signal ${citizen.should_warn ? "air-signal--warn" : ""}`}>
          <span className="air-signal__label">From citizen reports</span>
          <span className="air-signal__score">{citizen.risk_score}<span className="air-signal__scale">/100</span></span>
          <p className="air-signal__note">{citizen.explanation}</p>
        </div>

        <div className={`air-signal ${govt?.available && govt.approx_cpcb_style_score >= 50 ? "air-signal--warn" : ""}`}>
          <span className="air-signal__label">Modeled estimate (OpenWeatherMap)</span>
          {govt?.available ? (
            <>
              <span className="air-signal__score">
                {govt.approx_cpcb_style_score}
                <span className="air-signal__scale">/100 approx.</span>
              </span>
              <p className="air-signal__note">
                {govt.owm_aqi_label} · dominant: {govt.dominant_pollutant.toUpperCase()}
              </p>
            </>
          ) : (
            <p className="air-signal__note air-signal__note--unavailable">Signal unavailable right now</p>
          )}
        </div>
      </div>
    </div>
  );
}