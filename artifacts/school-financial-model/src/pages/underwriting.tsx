import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { ArrowRight, CheckCircle2, FileSpreadsheet, Lock, Save, Sparkles } from "lucide-react";

export function UnderwritingLandingPage() {
  return (
    <Layout>
      <section className="bg-gradient-to-b from-[#FAF9F7] to-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold tracking-widest text-[#328555] uppercase mb-4">
              Public Underwriting Wizard
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-[#1E293B] mb-6 leading-tight">
              Build a lender-ready financial model for your school.
            </h1>
            <p className="text-lg md:text-xl text-[#1E293B]/70 max-w-2xl mx-auto leading-relaxed">
              The full SchoolStack Budget wizard walks you through a 5-year pro forma
              in plain English — no spreadsheet experience required. Create a free
              account to start; your model saves automatically and you can come back
              any time.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#1E293B]/10 shadow-sm p-6 md:p-10 mb-10">
            <h2 className="font-display text-xl md:text-2xl font-bold text-[#1E293B] mb-6">
              What you'll get
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: <FileSpreadsheet className="w-5 h-5 text-[#328555]" />, text: "Investor-grade Excel workbook (3 / 8 / 21-tab formats)" },
                { icon: <Sparkles className="w-5 h-5 text-[#D97706]" />, text: "Consultant-grade analysis with DSCR, runway, and sensitivities" },
                { icon: <Save className="w-5 h-5 text-[#0D9488]" />, text: "Saved progress — adjust assumptions and re-run any time" },
                { icon: <Lock className="w-5 h-5 text-[#1E293B]" />, text: "Private to you. We never share or sell your data." },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-[#FAF9F7]">
                  <div className="w-9 h-9 bg-white rounded-lg shadow-sm flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <p className="text-sm leading-relaxed text-[#1E293B]/80 pt-1.5">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              href="/register"
              className="bg-[#328555] hover:bg-[#266a44] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg flex items-center justify-center gap-2"
              data-testid="link-register-from-underwriting"
            >
              Create free account
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="bg-white border-2 border-[#1E293B]/15 hover:border-[#328555] text-[#1E293B] px-8 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center"
              data-testid="link-login-from-underwriting"
            >
              I already have an account
            </Link>
          </div>

          <div className="text-center text-sm text-[#1E293B]/50 space-y-2">
            <p className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#328555]" />
              Free to use. No credit card required.
            </p>
            <p>
              Questions before you start?{" "}
              <a href="mailto:hello@schoolstack.ai" className="text-[#328555] font-semibold hover:underline">
                hello@schoolstack.ai
              </a>
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default UnderwritingLandingPage;
