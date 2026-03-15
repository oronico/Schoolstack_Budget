import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { LogOut, LayoutDashboard } from "lucide-react";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <img src={`${import.meta.env.BASE_URL}logos/schoolstack-mark.svg`} alt="SchoolStack" className="h-10 w-10 group-hover:scale-105 transition-transform duration-300" />
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground leading-none">SchoolStack <span className="text-primary">Budget</span></h1>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/dashboard" className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-border">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold leading-none">{user.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{user.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-muted-foreground hover:bg-black/10 hover:text-foreground transition-colors"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
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
  );
}
