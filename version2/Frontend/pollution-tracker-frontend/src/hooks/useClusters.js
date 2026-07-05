// Fetches the cluster list for the municipal dashboard and polls it,
// since ClusterOutWithFade's should_still_display/seconds_since_resolved
// fields (see schemas/report.py) are computed fresh on every serialize —
// polling is what makes a resolved marker actually fade out client-side
// without a page refresh.

import { useCallback, useEffect, useRef, useState } from "react";
import { listClusters } from "../services/api";

const POLL_INTERVAL_MS = 15000;

export function useClusters(statusFilter) {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const fetchClusters = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    try {
      const data = await listClusters(statusFilter || undefined);
      setClusters(data);
      setError("");
    } catch (err) {
      setError(err.message || "Couldn't load reports right now.");
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchClusters(false);

    pollRef.current = setInterval(() => fetchClusters(true), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchClusters]);

  // Client-side safety net: even between polls, drop any cluster whose
  // fade window has expired according to its own should_still_display
  // flag, so a resolved marker doesn't visibly linger until the next
  // 15s poll happens to land after its window closed.
  const visibleClusters = clusters.filter((c) => c.should_still_display !== false);

  return { clusters: visibleClusters, loading, error, refetch: () => fetchClusters(false) };
}