import { useCallback, useEffect, useState } from "react";
import { customFetch, type UserResponse } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { trackCoachingEvent } from "./track";

const STORAGE_KEY = "schoolstack:lenderLanguageEnabled";

function readLocal(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLocal(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* noop */
  }
}

interface AuthedUser extends UserResponse {
  lenderLanguageEnabled?: boolean;
}

/**
 * useLenderLanguage exposes the founder's "lender language" preference and a
 * setter that persists it. When authenticated, the value is mirrored to the
 * user record on the server (and to localStorage as a fast-path on next load).
 * For guests / unauthenticated views, the value lives in localStorage only.
 *
 * Toggling fires a `lender_language_toggled` track event with the new state.
 */
export function useLenderLanguage(): {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
} {
  const { user, refetchUser } = useAuth();
  const authedUser = user as AuthedUser | null;
  const serverValue = authedUser?.lenderLanguageEnabled;

  const [enabled, setEnabledState] = useState<boolean>(() =>
    typeof serverValue === "boolean" ? serverValue : readLocal(),
  );

  // When the authed user record loads / changes, accept the server value as
  // the source of truth and mirror it locally for guest-mode fallbacks.
  useEffect(() => {
    if (typeof serverValue === "boolean") {
      setEnabledState(serverValue);
      writeLocal(serverValue);
    }
  }, [serverValue]);

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      writeLocal(value);
      trackCoachingEvent("lender_language_toggled", { enabled: value });
      if (authedUser) {
        customFetch("/api/auth/lender-language", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: value }),
        })
          .then(() => {
            refetchUser().catch(() => {});
          })
          .catch(() => {
            // Best-effort: keep the local state even if the server is offline.
          });
      }
    },
    [authedUser, refetchUser],
  );

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return { enabled, setEnabled, toggle };
}
