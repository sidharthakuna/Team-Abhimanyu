// Wraps the browser Geolocation API so components don't each reinvent
// loading/error/permission handling. This is the actual mechanism
// behind "citizens can use live location since not everyone knows
// their lat/lng".

import { useCallback, useState } from "react";

export function useLiveLocation() {
  const [coords, setCoords] = useState(null); // { latitude, longitude }
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState("");

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("error");
      setError("Location isn't supported on this device. Enter the address manually.");
      return;
    }

    setStatus("loading");
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setStatus("success");
      },
      (geoError) => {
        setStatus("error");
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Location access was denied. Enable it in your browser settings, or pick a spot on the map.");
        } else {
          setError("Couldn't get your location. Try again, or pick a spot on the map.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const reset = useCallback(() => {
    setCoords(null);
    setStatus("idle");
    setError("");
  }, []);

  return { coords, status, error, requestLocation, reset, isLoading: status === "loading" };
}