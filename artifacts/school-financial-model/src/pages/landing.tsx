import { Link } from "wouter";
import { ArrowRight, Calculator, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { motion } from "framer-motion";
import { SampleModelShowcase } from "@/components/landing/SampleModelShowcase";

export function LandingPage() {
  return (
    <Layout>
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-primary/3" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mx-auto max-w-3xl"
          >
            <span className="inline-block py-1.5 px-4 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-6 border border-primary/20 shadow-sm">
              For Every K-12 Entrepreneur
            </span>
            <h1 className="font-display text-5xl md:text-7xl font-extrabold text-foreground tracking-tight mb-8 leading-[1.1]">
              Your mission deserves a <span className="text-primary">financial story</span>.
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl mx-auto">
              Whether you're starting a charter, private school, microschool, learning pod, or something entirely new — build a 5-year budget that brings your vision to life. No finance degree required.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/underwriting" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground text-lg font-semibold shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300">
                Build My Model <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/login" className="w-full sm:w-auto flex items-center justify-center px-8 py-4 rounded-xl bg-card border-2 border-border text-foreground text-lg font-semibold hover:border-primary/30 hover:bg-primary/5 transition-all duration-300">
                Log into existing
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-card border-y border-border/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-4">
              A budget is just the financial story of your mission
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We all start somewhere. SchoolStack Budget walks you through each step — from enrollment to expenses — so you can tell your story with confidence.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Calculator className="h-8 w-8 text-primary" />}
              title="Guided Wizard"
              description="We walk you through enrollment, staffing, and facility planning one step at a time. Your budget is a living document — it gets better every time you revisit it."
              delay={0}
            />
            <FeatureCard 
              icon={<FileSpreadsheet className="h-8 w-8 text-accent" />}
              title="Underwriting Ready"
              description="When you're ready, export a polished, multi-tab Excel workbook with real formulas — designed to help lenders and investors see your vision."
              delay={0.1}
            />
            <FeatureCard 
              icon={<ShieldCheck className="h-8 w-8 text-primary" />}
              title="Consultant Guidance"
              description="Get friendly, plain-English guidance on your model — with encouragement on what's working and constructive suggestions for areas to strengthen."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      <SampleModelShowcase />

      <section className="py-20 bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-4">
              Ready to tell the financial story of your school?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              Join K-12 entrepreneurs building schools for families. Every great school started with someone brave enough to take the first step.
            </p>
            <Link href="/underwriting" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground text-lg font-semibold shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300">
              Get Started Free <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      className="flex flex-col items-center text-center p-8 rounded-2xl bg-background border border-border/50 hover:shadow-xl hover:border-primary/20 transition-all duration-300"
    >
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="font-display text-xl font-bold text-foreground mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}
