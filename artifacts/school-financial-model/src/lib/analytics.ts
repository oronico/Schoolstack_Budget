const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

let initialized = false;

export function initGA() {
  if (initialized) return;
  if (!GA_MEASUREMENT_ID) return;
  if (import.meta.env.DEV) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  }
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    cookie_flags: "SameSite=None;Secure",
  });

  initialized = true;
}

function disableGA() {
  if (!GA_MEASUREMENT_ID) return;

  (window as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

  const gaCookies = document.cookie.split(";").map(c => c.trim());
  for (const cookie of gaCookies) {
    const name = cookie.split("=")[0];
    if (name.startsWith("_ga")) {
      const domain = window.location.hostname;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${domain}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

export function getConsent(): "accepted" | "declined" | null {
  const value = localStorage.getItem("cookie_consent");
  if (value === "accepted" || value === "declined") return value;
  return null;
}

export function setConsent(choice: "accepted" | "declined") {
  localStorage.setItem("cookie_consent", choice);
  if (choice === "accepted") {
    initGA();
  } else {
    disableGA();
  }
}

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
