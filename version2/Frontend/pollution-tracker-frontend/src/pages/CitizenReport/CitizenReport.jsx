import { useState } from "react";
import { Header } from "../../components/Header/Header";
import { ReportForm } from "../../components/ReportForm/ReportForm";
import { AirQualityBanner } from "../../components/AirQualityBanner/AirQualityBanner";
import { Toast } from "../../components/Toast/Toast";
import { createReport, getAirQualityRisk } from "../../services/api";
import { getCategoryInfo } from "../../utils/categoryUtils";
import "./CitizenReport.css";

export function CitizenReport({ username, onSwitchRole, onLogout }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastReport, setLastReport] = useState(null); // classified report just submitted
  const [airQuality, setAirQuality] = useState(null);
  const [toast, setToast] = useState(null); // { message, tone }
  const [formKey, setFormKey] = useState(0); // bump to reset ReportForm after a successful submit

  async function handleSubmit(payload) {
    setIsSubmitting(true);
    try {
      const report = await createReport(payload);
      setLastReport(report);
      setToast({
        message: report.is_duplicate_of_cluster
          ? "Report added to an existing cluster nearby. Thank you!"
          : "Report submitted successfully!",
        tone: "success",
      });
      setFormKey((k) => k + 1);

      // Fire-and-forget air quality check for the same spot, since this
      // is exactly the "citizen opens the report form with a known
      // location" moment air_quality_risk.py's docstring describes.
      getAirQualityRisk(payload.latitude, payload.longitude)
        .then(setAirQuality)
        .catch(() => setAirQuality(null));
    } catch (err) {
      setToast({ message: err.message || "Couldn't submit the report. Try again.", tone: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const lastCategory = lastReport ? getCategoryInfo(lastReport.category) : null;

  return (
    <div className="citizen-page">
      <Header role="citizen" username={username} onSwitchRole={onSwitchRole} onLogout={onLogout} />

      <div className="citizen-page__content">
        <div className="citizen-page__intro">
          <h1 className="citizen-page__heading">Report an issue</h1>
          <p className="citizen-page__sub">Snap a photo, add the location, and we'll route it to the right department.</p>
        </div>

        {lastCategory && (
          <div className="citizen-page__last-report">
            <span className="citizen-page__last-report-icon">{lastCategory.icon}</span>
            <div>
              <strong>Detected as {lastCategory.label}</strong>
              <p>Confidence: {lastReport.ai_confidence != null ? `${Math.round(lastReport.ai_confidence * 100)}%` : "n/a"}</p>
            </div>
          </div>
        )}

        <AirQualityBanner data={airQuality} />

        <ReportForm key={formKey} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}