const SESSION_KEY = "cta_session_id";
const ATTRIBUTION_KEY = "cta_attribution";
const ATTRIBUTION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type CapabilitySlug =
  | "single-year-pro-forma"
  | "five-year-pro-forma"
  | "scenario-planning"
  | "debt-analysis"
  | "budgeting-accounting-guidance";

export type AudienceSlug =
  | "charter-schools"
  | "private-schools"
  | "microschools"
  | "school-founders"
  | "lenders";

export type CtaPosition = "primary" | "closing";

export type CtaAttribution =
  | { channel: "capability"; source: CapabilitySlug; position: CtaPosition; ts: number }
  | { channel: "audience"; audience: AudienceSlug; ts: number }
  | { channel: "cross_link"; audience: AudienceSlug; source: CapabilitySlug; ts: number };

function safeGetSession(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto as Crypto & { randomUUID?: () => string }).randomUUID
        ? crypto.randomUUID()
        : `s_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function postJson(path: string, body: Record<string, unknown>, token?: string): void {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore tracking failures
  }
}

export function setCtaAttribution(attribution: CtaAttribution): void {
  try {
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {
    // ignore
  }
}

export function getCtaAttribution(): CtaAttribution | null {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CtaAttribution;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > ATTRIBUTION_TTL_MS) {
      sessionStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCtaAttribution(): void {
  try {
    sessionStorage.removeItem(ATTRIBUTION_KEY);
  } catch {
    // ignore
  }
}

export function trackCapabilityCta(source: CapabilitySlug, position: CtaPosition): void {
  setCtaAttribution({ channel: "capability", source, position, ts: Date.now() });
  postJson("/api/public/track-cta", {
    event: "capability_cta_click",
    source,
    position,
    sessionId: safeGetSession(),
  });
}

export function trackAudienceCard(audience: AudienceSlug): void {
  setCtaAttribution({ channel: "audience", audience, ts: Date.now() });
  postJson("/api/public/track-cta", {
    event: "audience_card_click",
    audience,
    sessionId: safeGetSession(),
  });
}

export function trackCapabilityCrossLink(audience: AudienceSlug, source: CapabilitySlug): void {
  setCtaAttribution({ channel: "cross_link", audience, source, ts: Date.now() });
  postJson("/api/public/track-cta", {
    event: "capability_cross_link_click",
    audience,
    source,
    sessionId: safeGetSession(),
  });
}

export function reportAttributedSignup(token: string): void {
  const attribution = getCtaAttribution();
  if (!attribution) return;

  const metadata: Record<string, unknown> = {
    channel: attribution.channel,
    sessionId: safeGetSession(),
  };
  if (attribution.channel === "capability") {
    metadata.source = attribution.source;
    metadata.position = attribution.position;
  } else if (attribution.channel === "audience") {
    metadata.audience = attribution.audience;
  } else if (attribution.channel === "cross_link") {
    metadata.audience = attribution.audience;
    metadata.source = attribution.source;
  }

  postJson("/api/auth/track", { event: "cta_attributed_signup", metadata }, token);
  clearCtaAttribution();
}
