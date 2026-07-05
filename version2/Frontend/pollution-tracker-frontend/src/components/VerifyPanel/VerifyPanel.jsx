import { useRef, useState } from "react";
import { getVerificationInfo } from "../../utils/categoryUtils";
import "./VerifyPanel.css";

export function VerifyPanel({ cluster, onVerify, isSubmitting }) {
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const verification = getVerificationInfo(cluster.verification_status);

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    setAfterPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!afterPhoto) {
      setError("Choose an after-photo first.");
      return;
    }
    await onVerify(afterPhoto);
    setAfterPhoto(null);
    setPreview(null);
  }

  return (
    <div className="verify-panel">
      <div className="verify-panel__header">
        <span className="verify-panel__title">Before / After Verification</span>
        <span
          className="verify-panel__badge"
          style={{ background: verification.color + "1A", color: verification.color }}
        >
          {verification.label}
        </span>
      </div>

      {cluster.verification_confidence != null && (
        <p className="verify-panel__confidence mono">
          Confidence: {(cluster.verification_confidence * 100).toFixed(0)}%
        </p>
      )}

      <p className="verify-panel__hint">
        Upload a photo showing the issue has been resolved. It's compared automatically against the original report.
      </p>

      {preview ? (
        <div className="verify-panel__preview">
          <img src={preview} alt="After photo preview" />
          <button
            type="button"
            className="verify-panel__remove"
            onClick={() => {
              setAfterPhoto(null);
              setPreview(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <button type="button" className="verify-panel__trigger" onClick={() => fileInputRef.current?.click()}>
          <span aria-hidden="true">📸</span>
          <span>Choose after-photo</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="visually-hidden"
      />

      {error && <p className="verify-panel__error">{error}</p>}

      <button
        type="button"
        className="verify-panel__submit"
        onClick={handleSubmit}
        disabled={!afterPhoto || isSubmitting}
      >
        {isSubmitting ? "Verifying…" : "Submit for verification"}
      </button>
    </div>
  );
}