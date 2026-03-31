import { Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { LogOut, LayoutDashboard, Settings, HelpCircle, BookOpen, Sliders } from "lucide-react";
import { GuidanceModeSelector } from "@/components/coaching/GuidanceModeSelector";
import { BudgetPrimer } from "@/components/coaching/BudgetPrimer";
import { trackCoachingEvent } from "@/lib/coaching/track";

export function Navbar() {
  const { user, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPrimer, setShowPrimer] = useState(false);
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
                        <GuidanceModeSelector />
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
    </>
  );
}
