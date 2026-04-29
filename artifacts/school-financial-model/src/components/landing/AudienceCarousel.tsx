import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  GraduationCap,
  Building2,
  Home,
  Sparkles,
  Handshake,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";

interface AudienceCard {
  slug: string;
  name: string;
  tagline: string;
  Icon: LucideIcon;
  accent: string;
  iconBg: string;
  iconColor: string;
}

const AUDIENCES: AudienceCard[] = [
  {
    slug: "charter-schools",
    name: "Charter Schools",
    tagline: "Per-pupil funding, weighted allocations, and authorizer-ready exports.",
    Icon: GraduationCap,
    accent: "from-[#328555]/15 to-[#328555]/5",
    iconBg: "bg-[#328555]/15",
    iconColor: "text-[#328555]",
  },
  {
    slug: "private-schools",
    name: "Private Schools",
    tagline:
      "Tuition tiers, financial aid, and lender-ready 5-year projections.",
    Icon: Building2,
    accent: "from-[#0D9488]/15 to-[#0D9488]/5",
    iconBg: "bg-[#0D9488]/15",
    iconColor: "text-[#0D9488]",
  },
  {
    slug: "microschools",
    name: "Microschools & Pods",
    tagline:
      "Lean staffing, ESA revenue, and break-even math for small schools.",
    Icon: Home,
    accent: "from-[#D97706]/15 to-[#D97706]/5",
    iconBg: "bg-[#D97706]/15",
    iconColor: "text-[#D97706]",
  },
  {
    slug: "school-founders",
    name: "School Founders",
    tagline:
      "Guided, plain-English planning - from blank page to a finished model.",
    Icon: Sparkles,
    accent: "from-[#1E293B]/10 to-[#1E293B]/5",
    iconBg: "bg-[#1E293B]/10",
    iconColor: "text-[#1E293B]",
  },
  {
    slug: "lenders",
    name: "Lenders & CDFIs",
    tagline:
      "Consistent borrower financials with DSCR, sensitivity, and an underwriting packet.",
    Icon: Handshake,
    accent: "from-[#4A7CB8]/15 to-[#4A7CB8]/5",
    iconBg: "bg-[#4A7CB8]/15",
    iconColor: "text-[#4A7CB8]",
  },
];

const AUTO_ADVANCE_MS = 5500;

export function AudienceCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (i: number) => {
      const next = (i + AUDIENCES.length) % AUDIENCES.length;
      setActive(next);
    },
    [],
  );

  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  // Auto-advance with pause on hover
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % AUDIENCES.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused]);

  // Sync scroll position when active changes (mobile swipe friendly)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[active] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
  }, [active]);

  // Update active when user swipes on mobile
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const children = Array.from(track.children) as HTMLElement[];
        if (!children.length) return;
        const center = track.scrollLeft + track.clientWidth / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        children.forEach((c, i) => {
          const cardCenter = c.offsetLeft + c.clientWidth / 2;
          const dist = Math.abs(cardCenter - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        });
        if (bestIdx !== active) setActive(bestIdx);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  return (
    <section className="py-24 bg-white border-t border-[#1E293B]/5">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-sm font-bold tracking-widest text-[#328555] uppercase mb-3">
            Built for...
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
            One platform, every kind of school.
          </h2>
          <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
            See how SchoolStack Budget fits the way your school actually works.
          </p>
        </motion.div>

        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div
            ref={trackRef}
            className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-6 -mx-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="region"
            aria-label="Audience carousel"
            aria-live="polite"
          >
            {AUDIENCES.map((a, i) => {
              const Icon = a.Icon;
              const isActive = i === active;
              return (
                <Link
                  key={a.slug}
                  href={`/for/${a.slug}`}
                  className={`snap-center shrink-0 w-[85%] sm:w-[60%] lg:w-[42%] rounded-3xl border bg-gradient-to-br ${a.accent} p-8 transition-all duration-500 group ${
                    isActive
                      ? "border-[#1E293B]/15 shadow-xl scale-100 opacity-100"
                      : "border-[#1E293B]/5 shadow-sm scale-95 opacity-70 hover:opacity-100"
                  }`}
                  aria-current={isActive ? "true" : undefined}
                  data-testid={`audience-card-${a.slug}`}
                >
                  <div
                    className={`w-14 h-14 rounded-2xl ${a.iconBg} flex items-center justify-center mb-5`}
                  >
                    <Icon className={`w-7 h-7 ${a.iconColor}`} />
                  </div>
                  <h3 className="font-display text-2xl font-bold text-[#1E293B] mb-3">
                    {a.name}
                  </h3>
                  <p className="text-[#1E293B]/70 leading-relaxed mb-6">
                    {a.tagline}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#328555] group-hover:gap-2.5 transition-all">
                    Explore for {a.name.toLowerCase()}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prev}
                className="w-10 h-10 rounded-full border border-[#1E293B]/10 bg-white shadow-sm flex items-center justify-center text-[#1E293B]/70 hover:text-[#1E293B] hover:border-[#1E293B]/20 transition"
                aria-label="Previous audience"
                data-testid="audience-prev"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="w-10 h-10 rounded-full border border-[#1E293B]/10 bg-white shadow-sm flex items-center justify-center text-[#1E293B]/70 hover:text-[#1E293B] hover:border-[#1E293B]/20 transition"
                aria-label="Next audience"
                data-testid="audience-next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {AUDIENCES.map((a, i) => (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === active
                      ? "w-8 bg-[#328555]"
                      : "w-2 bg-[#1E293B]/20 hover:bg-[#1E293B]/40"
                  }`}
                  aria-label={`Show ${a.name}`}
                  aria-current={i === active ? "true" : undefined}
                  data-testid={`audience-dot-${i}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
