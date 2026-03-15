import React from 'react';
import './_group.css';
import { NavBar } from './_shared/NavBar';
import { Footer } from './_shared/Footer';
import { 
  Calculator, 
  LineChart, 
  Users, 
  Clock, 
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Settings,
  Download,
  Activity,
  Briefcase,
  Building,
  GraduationCap
} from 'lucide-react';

export function LandingBudget() {
  return (
    <div className="min-h-screen bg-[#FAF9F7] font-['Nunito'] text-[#1E293B] overflow-x-hidden">
      <NavBar product="budget" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-[#328555]/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-[#D97706]/10 rounded-full blur-3xl"></div>
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-sm mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#328555] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#328555]"></span>
              </span>
              ALPHA
            </div>
            
            <h1 className="font-['Quicksand'] text-5xl md:text-6xl font-bold text-[#1E293B] leading-tight mb-6">
              Build Your Budget and <span className="text-[#328555]">Financial Model</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-[#1E293B]/70 mb-4 leading-relaxed font-medium">
              Your budget is the financial story to fuel your mission.
            </p>
            
            <p className="text-lg text-[#1E293B]/60 mb-10 leading-relaxed max-w-2xl">
              An easy-to-follow, step-by-step guide designed specifically for school founders to build robust pro forma and financial models without needing a finance degree.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="bg-[#D97706] hover:bg-[#B45309] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#D97706]/20 flex items-center justify-center gap-2">
                Start Your Budget
                <ArrowRight className="w-5 h-5" />
              </button>
              <button className="bg-white hover:bg-gray-50 text-[#1E293B] border border-[#1E293B]/10 px-8 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center">
                View Sample Model
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* What You'll Build Section */}
      <section className="py-24 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-['Quicksand'] text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              What You'll Build
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              A comprehensive financial package ready for authorizers, lenders, and your founding board.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <LineChart className="w-8 h-8 text-[#328555]" />,
                title: "Revenue Projections",
                desc: "Accurate forecasts based on per-pupil funding, categorical grants, and fundraising goals."
              },
              {
                icon: <Calculator className="w-8 h-8 text-[#D97706]" />,
                title: "Expense Planning",
                desc: "Detailed categorization of instructional, operational, and facility costs."
              },
              {
                icon: <Users className="w-8 h-8 text-[#0D9488]" />,
                title: "Staffing Model",
                desc: "Salary schedules, benefits, and hiring timelines aligned with enrollment growth."
              },
              {
                icon: <Clock className="w-8 h-8 text-[#5B7CFA]" />,
                title: "Cash Flow Timeline",
                desc: "Month-by-month cash flow analysis to identify and plan for funding gaps."
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#FAF9F7] p-8 rounded-2xl border border-[#1E293B]/5 hover:shadow-lg transition group">
                <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="font-['Quicksand'] text-xl font-bold text-[#1E293B] mb-3">{item.title}</h3>
                <p className="text-[#1E293B]/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-[#1E293B] text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#328555]/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3"></div>
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="mb-16 md:w-2/3">
            <h2 className="font-['Quicksand'] text-3xl md:text-4xl font-bold mb-4">
              Budgeting made for school founders.
            </h2>
            <p className="text-xl text-white/60">
              Stop fighting with broken spreadsheet templates. SchoolStack Budget guides you through the process with built-in education finance logic.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: <Activity className="w-6 h-6 text-white" />,
                color: "bg-[#328555]",
                title: "Guided Walkthrough",
                desc: "A step-by-step interview process that asks you questions in plain English and translates your answers into financial data."
              },
              {
                icon: <Settings className="w-6 h-6 text-white" />,
                color: "bg-[#D97706]",
                title: "Smart Defaults",
                desc: "Start with pre-populated assumptions based on school benchmarks for your state and region."
              },
              {
                icon: <FileSpreadsheet className="w-6 h-6 text-white" />,
                color: "bg-[#0D9488]",
                title: "Real-Time Modeling",
                desc: "Change an assumption—like student enrollment or teacher salaries—and instantly see how it ripples through your entire budget."
              },
              {
                icon: <Download className="w-6 h-6 text-white" />,
                color: "bg-[#5B7CFA]",
                title: "Export Ready",
                desc: "Generate professional, presentation-ready reports for authorizer meetings, board presentations, and loan applications."
              }
            ].map((feature, i) => (
              <div key={i} className="flex gap-6 p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${feature.color}`}>
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-['Quicksand'] text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-white/60 leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-24 bg-[#FAF9F7]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-['Quicksand'] text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              Built for the crucial moments
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              SchoolStack Budget provides the financial credibility you need when it matters most.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#1E293B]/5 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-[#328555]/10 flex items-center justify-center mb-6">
                <GraduationCap className="w-8 h-8 text-[#328555]" />
              </div>
              <h3 className="font-['Quicksand'] text-xl font-bold text-[#1E293B] mb-3">Authorizer Meetings</h3>
              <p className="text-[#1E293B]/60">Demonstrate financial viability and operational competence to secure approval and funding.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#1E293B]/5 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-[#D97706]/10 flex items-center justify-center mb-6">
                <Building className="w-8 h-8 text-[#D97706]" />
              </div>
              <h3 className="font-['Quicksand'] text-xl font-bold text-[#1E293B] mb-3">Loan Applications</h3>
              <p className="text-[#1E293B]/60">Provide lenders with the detailed cash flow projections required for facility financing.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#1E293B]/5 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-[#0D9488]/10 flex items-center justify-center mb-6">
                <Briefcase className="w-8 h-8 text-[#0D9488]" />
              </div>
              <h3 className="font-['Quicksand'] text-xl font-bold text-[#1E293B] mb-3">Board Presentations</h3>
              <p className="text-[#1E293B]/60">Give your founding board clear, transparent financial models they can confidently stand behind.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-sell Section */}
      <section className="py-20 bg-white border-t border-[#1E293B]/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm font-bold tracking-widest text-[#1E293B]/40 uppercase mb-4">From the SchoolStack Suite</p>
          <h2 className="font-['Quicksand'] text-2xl md:text-3xl font-bold text-[#1E293B] mb-6">
            Connecting your facilities, budget, and project plan.
          </h2>
          <p className="text-lg text-[#1E293B]/60 mb-8">
            SchoolStack Budget works seamlessly alongside SchoolStack Space (facility planning) and the flagship SchoolStack project management platform to keep your entire founding journey aligned.
          </p>
          <div className="flex justify-center gap-4 text-sm font-bold">
            <span className="flex items-center gap-2 text-[#5B7CFA]">
              <CheckCircle2 className="w-4 h-4" /> Space
            </span>
            <span className="flex items-center gap-2 text-[#328555]">
              <CheckCircle2 className="w-4 h-4" /> Budget
            </span>
            <span className="flex items-center gap-2 text-[#D97706]">
              <CheckCircle2 className="w-4 h-4" /> Project
            </span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#328555] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1E293B]/20 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2"></div>
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="font-['Quicksand'] text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to tell your financial story?
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Join the Alpha program today and be among the first founders to build a better budget with SchoolStack.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-[#328555] hover:bg-gray-50 px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg">
              Build Your First Budget
            </button>
            <button className="bg-transparent border border-white/30 text-white hover:bg-white/10 px-8 py-4 rounded-xl font-bold text-lg transition">
              Talk to Sales
            </button>
          </div>
        </div>
      </section>

      <Footer product="budget" />
    </div>
  );
}

export default LandingBudget;
