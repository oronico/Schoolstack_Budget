import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-[hsl(142,72%,12%)] text-white/90">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <span className="font-display text-lg font-bold text-white leading-none">$</span>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-white leading-none">SchoolStack Budget</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">by SchoolStack.ai</p>
              </div>
            </div>
            <p className="text-sm text-white/60 leading-relaxed max-w-xs">
              Build a simple 5-year financial model for your school, save your work, and export a lender-ready workbook.
            </p>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-wider text-white/50 mb-4">Product</h4>
            <ul className="space-y-2.5">
              <li><Link href="/" className="text-sm text-white/70 hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/register" className="text-sm text-white/70 hover:text-white transition-colors">Get Started</Link></li>
              <li><Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors">Sign In</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-wider text-white/50 mb-4">Resources</h4>
            <ul className="space-y-2.5">
              <li><a href="#" className="text-sm text-white/70 hover:text-white transition-colors">About</a></li>
              <li><a href="#" className="text-sm text-white/70 hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="text-sm text-white/70 hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-wider text-white/50 mb-4">Built By</h4>
            <p className="text-sm text-white/70 leading-relaxed">
              A product of{" "}
              <span className="font-semibold text-white">Building Hope Impact Fund</span>
            </p>
            <p className="text-sm text-white/50 mt-2 leading-relaxed">
              Supporting school founders with the tools they need to launch and sustain great schools.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} Building Hope Impact Fund. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-white/40 hover:text-white/70 transition-colors">Privacy</a>
            <a href="#" className="text-xs text-white/40 hover:text-white/70 transition-colors">Terms</a>
            <a href="#" className="text-xs text-white/40 hover:text-white/70 transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
