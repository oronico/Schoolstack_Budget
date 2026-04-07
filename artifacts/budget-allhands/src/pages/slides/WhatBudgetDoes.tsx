export default function WhatBudgetDoes() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "linear-gradient(160deg, #1E293B 0%, #2D4A3E 100%)" }}>
      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-white/40 font-medium" style={{ fontSize: "1.3vw" }}>03</span>
      </div>
      <div className="absolute top-[12vh] right-[8vw] w-[20vw] h-[20vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(50,133,85,0.15) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[5vh] left-[3vw] w-[15vw] h-[15vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(74,124,184,0.1) 0%, transparent 70%)" }} />

      <div className="flex flex-col h-full px-[6vw] pt-[6vh]">
        <span className="font-body font-bold text-primary uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1.3vw" }}>What SchoolStack Budget Does</span>
        <h2 className="font-display text-white leading-tight mb-[1vh]" style={{ fontSize: "3.2vw" }}>
          Makes the math make sense.
        </h2>
        <p className="font-body text-white/60 mb-[4vh] max-w-[55vw]" style={{ fontSize: "1.5vw" }}>
          A guided platform that turns what founders already know into a professional 5-year financial model.
        </p>

        <div className="flex gap-[2vw]">
          <div className="flex-1 bg-white/8 backdrop-blur-sm rounded-[1vw] p-[2vw] border border-white/10">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center mb-[1.5vh]">
              <span className="font-body font-bold text-primary" style={{ fontSize: "1.4vw" }}>8</span>
            </div>
            <h3 className="font-body font-bold text-white mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>Step Guided Wizard</h3>
            <p className="font-body text-white/50" style={{ fontSize: "1.3vw" }}>School profile, enrollment, revenue, staffing, expenses, analysis, scenarios, and exports</p>
          </div>

          <div className="flex-1 bg-white/8 backdrop-blur-sm rounded-[1vw] p-[2vw] border border-white/10">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-accent/20 flex items-center justify-center mb-[1.5vh]">
              <span className="font-body font-bold text-accent" style={{ fontSize: "1.4vw" }}>AI</span>
            </div>
            <h3 className="font-body font-bold text-white mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>Consultant Analysis</h3>
            <p className="font-body text-white/50" style={{ fontSize: "1.3vw" }}>Real-time coaching, health signals, lender-readiness scoring, and actionable recs</p>
          </div>

          <div className="flex-1 bg-white/8 backdrop-blur-sm rounded-[1vw] p-[2vw] border border-white/10">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-blue/20 flex items-center justify-center mb-[1.5vh]">
              <span className="font-body font-bold text-blue" style={{ fontSize: "1.4vw" }}>&#916;</span>
            </div>
            <h3 className="font-body font-bold text-white mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>Scenario Planner</h3>
            <p className="font-body text-white/50" style={{ fontSize: "1.3vw" }}>Stress test assumptions, compare scenarios side by side, see the downside before it happens</p>
          </div>

          <div className="flex-1 bg-white/8 backdrop-blur-sm rounded-[1vw] p-[2vw] border border-white/10">
            <div className="w-[3vw] h-[3vw] rounded-[0.6vw] bg-primary/20 flex items-center justify-center mb-[1.5vh]">
              <span className="font-body font-bold text-primary" style={{ fontSize: "1.4vw" }}>&#8595;</span>
            </div>
            <h3 className="font-body font-bold text-white mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>Professional Exports</h3>
            <p className="font-body text-white/50" style={{ fontSize: "1.3vw" }}>21-tab underwriting workbook, formula-driven Excel, PDF reports, shareable links</p>
          </div>
        </div>
      </div>
    </div>
  );
}
