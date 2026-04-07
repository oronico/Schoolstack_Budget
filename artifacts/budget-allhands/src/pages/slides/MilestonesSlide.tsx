export default function MilestonesSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "linear-gradient(180deg, #FAF9F7 0%, #F0EDE8 100%)" }}>
      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-muted font-medium" style={{ fontSize: "1.3vw" }}>04</span>
      </div>
      <div className="absolute bottom-0 right-0 w-[25vw] h-[25vh] rounded-tl-full" style={{ background: "linear-gradient(135deg, rgba(50,133,85,0.06) 0%, rgba(217,119,6,0.04) 100%)" }} />

      <div className="flex flex-col h-full px-[6vw] pt-[6vh]">
        <span className="font-body font-bold text-primary uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1.3vw" }}>Development Journey</span>
        <div className="flex items-end gap-[3vw] mb-[4vh]">
          <h2 className="font-display text-text leading-tight" style={{ fontSize: "3.2vw" }}>
            What we've shipped
          </h2>
          <span className="font-display text-primary/30" style={{ fontSize: "6vw", lineHeight: 0.85 }}>157+</span>
          <span className="font-body text-muted mb-[0.8vh]" style={{ fontSize: "1.4vw" }}>merged tasks since March 14</span>
        </div>

        <div className="flex gap-[2vw] flex-1">
          <div className="flex-1 flex flex-col gap-[1.5vh]">
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>Universal Financial Model</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>Any school type: charter, private, micro, pod, co-op, or tutoring center</p>
            </div>
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>UX Coaching Co-Pilot</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>Prep checklists, glossary tooltips, step-by-step guidance, consultant narrative coaching, health summaries</p>
            </div>
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>Escalation Override Engine</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>Lock line items to fixed rates while others inherit global inflation — lender-grade accuracy</p>
            </div>
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>Stress Testing</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>Sensitivity matrices, scenario comparison, enrollment/tuition stress</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-[1.5vh]">
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-accent" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>K-12 Universal Coverage</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>5 validated archetypes — micro, private+ESA, charter, co-op, grade-band — with 157+ regression tests</p>
            </div>
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-accent" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>21-Tab Underwriting Workbook</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>Formula-driven Excel so lenders can adjust assumptions themselves</p>
            </div>
            <div className="bg-white rounded-[0.8vw] p-[1.5vw] border border-text/5">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-accent" />
                <span className="font-body font-bold text-text" style={{ fontSize: "1.4vw" }}>Budget Narrative System</span>
              </div>
              <p className="font-body text-muted" style={{ fontSize: "1.3vw" }}>Plain-English explanations of every metric, ratio, and consultant finding</p>
            </div>
            <div className="bg-primary/10 rounded-[0.8vw] p-[1.5vw] border border-primary/20">
              <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
                <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary" />
                <span className="font-body font-bold text-primary" style={{ fontSize: "1.4vw" }}>Beta Released</span>
              </div>
              <p className="font-body text-text/70" style={{ fontSize: "1.3vw" }}>Free during beta — live at budget.schoolstack.ai</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
