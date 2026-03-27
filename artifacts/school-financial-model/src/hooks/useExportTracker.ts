import { useState, useCallback, useEffect } from "react";

const EXPORT_COUNT_KEY = "budget_export_count";
export const EXPORT_EVENT = "budget:export";

export function trackExport() {
  window.dispatchEvent(new CustomEvent(EXPORT_EVENT));
}

export function useExportTracker() {
  const [exportCount, setExportCount] = useState(() => {
    const stored = localStorage.getItem(EXPORT_COUNT_KEY);
    return stored ? parseInt(stored, 10) || 0 : 0;
  });

  useEffect(() => {
    function handleExport() {
      setExportCount((prev) => {
        const next = prev + 1;
        localStorage.setItem(EXPORT_COUNT_KEY, String(next));
        return next;
      });
    }
    window.addEventListener(EXPORT_EVENT, handleExport);
    return () => window.removeEventListener(EXPORT_EVENT, handleExport);
  }, []);

  return { exportCount };
}
