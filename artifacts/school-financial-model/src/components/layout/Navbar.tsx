import { Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { LogOut, LayoutDashboard, Settings, HelpCircle, BookOpen, UserCog, ChevronDown } from "lucide-react";
import { GuidanceModeSelector } from "@/components/coaching/GuidanceModeSelector";
import { BudgetPrimer } from "@/components/coaching/BudgetPrimer";
import { FounderPersonaPrompt } from "@/components/coaching/FounderPersonaPrompt";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { SOLUTION_LINK_SUMMARIES } from "@/data/solution-pages";

function SolutionsMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href="/solutions"
        onClick={() => setOpen(false)}
        className="hidden sm:inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        data-testid="navbar-solutions-link"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Solutions
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </Link>
      <Link
        href="/solutions"
        className="sm:hidden inline-flex items-center px-3 py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        data-testid="navbar-solutions-link-mobile"
      >
        Solutions
      </Link>
      {open && (
        <div
          className="hidden sm:block absolute left-0 top-full pt-2 w-72 z-50"
          role="menu"
        >
          <div className="rounded-xl border border-border bg-background shadow-xl animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden">
            {SOLUTION_LINK_SUMMARIES.map(({ slug, title, tagline, Icon }) => (
              <Link
                key={slug}
                href={`/solutions/${slug}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-4 py-3 text-sm text-foreground hover:bg-black/5 transition-colors"
                role="menuitem"
                data-testid={`navbar-solutions-item-${slug}`}
              >
                <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="font-semibold leading-tight">{title}</span>
                  <span className="text-xs text-muted-foreground mt-0.5 leading-snug">{tagline}</span>
                </span>
              </Link>
            ))}
            <div className="border-t border-border" />
            <Link
              href="/solutions"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
              role="menuitem"
              data-testid="navbar-solutions-view-all"
            >
              View all capabilities
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPrimer, setShowPrimer] = useState(false);
  const [showPersonaEdit, setShowPersonaEdit] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    }
    if (showSettings || showHelp) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings, showHelp]);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <img src={`${import.meta.env.BASE_URL}logos/schoolstack-mark.svg`} alt="SchoolStack" className="h-14 w-14 sm:h-18 sm:w-18 group-hover:scale-105 transition-transform duration-300" />
            <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-foreground leading-none">SchoolStack <span className="text-primary">Budget</span></h1>
          </Link>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <SolutionsMenu />
                <Link href="/dashboard" className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <div className="flex items-center gap-1 pl-4 border-l border-border">
                  <div className="relative" ref={helpRef}>
                    <button
                      onClick={() => {
                        setShowHelp(!showHelp);
                        if (!showHelp) trackCoachingEvent("help_menu_opened");
                        setShowSettings(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
                      title="Help & Learning"
                      aria-expanded={showHelp}
                    >
                      <HelpCircle className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {showHelp && (
                      <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-background shadow-xl animate-in fade-in slide-in-from-top-1 duration-150 z-50">
                        <button
                          onClick={() => {
                            trackCoachingEvent("primer_opened");
                            setShowPrimer(true);
                            setShowHelp(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-t-xl transition-colors"
                        >
                          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          Budgeting Basics
                        </button>
                        <div className="border-t border-border mx-2" />
                        <div className="px-4 py-2.5">
                          <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1.5">Guidance Level</p>
                          <GuidanceModeSelector compact />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block text-right ml-2">
                    <p className="text-sm font-semibold leading-none">{user.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{user.email}</p>
                  </div>
                  <div className="relative" ref={settingsRef}>
                    <button
                      onClick={() => {
                        setShowSettings(!showSettings);
                        setShowHelp(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
                      title="Settings"
                      aria-expanded={showSettings}
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {showSettings && (
                      <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-background shadow-xl animate-in fade-in slide-in-from-top-1 duration-150 z-50">
                        <button
                          onClick={() => {
                            setShowPersonaEdit(true);
                            setShowSettings(false);
                            trackCoachingEvent("founder_persona_changed", { source: "navbar_settings" });
                          }}
                          data-testid="navbar-persona-edit"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-t-xl transition-colors"
                        >
                          <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                          Founder profile
                        </button>
                        <div className="border-t border-border mx-2" />
                        <button
                          onClick={logout}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-b-xl transition-colors"
                        >
                          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                          Log out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <SolutionsMenu />
                <Link href="/resources" className="px-4 py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors">
                  Resources
                </Link>
                <Link href="/login" className="px-4 py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors">
                  Log in
                </Link>
                <Link href="/register" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-200">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
      {showPrimer && <BudgetPrimer onClose={() => setShowPrimer(false)} />}
      {showPersonaEdit && (
        <FounderPersonaPrompt
          mode="edit"
          onClose={() => setShowPersonaEdit(false)}
          onComplete={() => setShowPersonaEdit(false)}
        />
      )}
    </>
  );
}
