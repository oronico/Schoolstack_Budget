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

export function getConsent(): "accepted" | "declined" | null {
  const value = localStorage.getItem("cookie_consent");
  if (value === "accepted" || value === "declined") return value;
  return null;
}

export function setConsent(choice: "accepted" | "declined") {
  localStorage.setItem("cookie_consent", choice);
  if (choice === "accepted") {
    initGA();
  }
}

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
