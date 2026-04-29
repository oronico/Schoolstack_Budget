const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

let initialized = false;

function enableGA() {
  if (!GA_MEASUREMENT_ID) return;
  if (import.meta.env.DEV) return;

  delete (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`];

  if (!initialized) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
    initialized = true;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  }
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    cookie_flags: "SameSite=None;Secure",
  });
}

export function trackPageView(path: string, title?: string) {
  if (!GA_MEASUREMENT_ID) return;
  if (import.meta.env.DEV) return;
  if (getConsent() !== "accepted") return;
  if (!initialized) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push([
    "event",
    "page_view",
    {
      page_path: path,
      page_location: window.location.origin + path,
      page_title: title ?? document.title,
      send_to: GA_MEASUREMENT_ID,
    },
  ]);
}

function disableGA() {
  if (!GA_MEASUREMENT_ID) return;

  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

  const gaCookies = document.cookie.split(";").map(c => c.trim());
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  const domains = [hostname];
  if (parts.length > 2) {
    domains.push(parts.slice(-2).join("."));
  }
  for (const cookie of gaCookies) {
    const name = cookie.split("=")[0];
    if (name.startsWith("_ga")) {
      for (const d of domains) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${d}`;
      }
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

export function initGA() {
  enableGA();
}

export function getConsent(): "accepted" | "declined" | null {
  const value = localStorage.getItem("cookie_consent");
  if (value === "accepted" || value === "declined") return value;
  return null;
}

export function setConsent(choice: "accepted" | "declined") {
  localStorage.setItem("cookie_consent", choice);
  if (choice === "accepted") {
    enableGA();
  } else {
    disableGA();
  }
}

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
