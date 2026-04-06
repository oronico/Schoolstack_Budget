export default function LendingLabSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "linear-gradient(160deg, #1E293B 0%, #3B2F1A 100%)" }}>
      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-white/40 font-medium" style={{ fontSize: "1.3vw" }}>06</span>
      </div>
      <div className="absolute top-0 right-0 w-[40vw] h-[40vh] rounded-bl-full" style={{ background: "radial-gradient(circle at top right, rgba(217,119,6,0.12) 0%, transparent 70%)" }} />

      <div className="flex flex-col h-full px-[6vw] pt-[6vh]">
        <span className="font-body font-bold text-accent uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1.3vw" }}>Budget + The Lending Lab</span>
        <h2 className="font-display text-white leading-tight mb-[1.5vh]" style={{ fontSize: "3.2vw" }}>
          From model to application-ready.
        </h2>
        <p className="font-body text-white/55 mb-[4vh] max-w-[55vw]" style={{ fontSize: "1.5vw" }}>
          Budget evaluates every model against real underwriting criteria so founders know exactly where they stand before they apply.
        </p>

        <div className="flex gap-[2vw] mb-[4vh]">
          <div className="flex-1 bg-white/8 rounded-[1vw] p-[2vw] border border-white/10">
            <span className="font-body font-bold text-primary" style={{ fontSize: "1.3vw" }}>Personnel Costs</span>
            <div className="flex items-end gap-[0.5vw] mt-[1vh]">
              <span className="font-display text-white" style={{ fontSize: "3.5vw", lineHeight: 1 }}>&#8804;60%</span>
            </div>
            <p className="font-body text-white/50 mt-[0.5vh]" style={{ fontSize: "1.3vw" }}>of total expenses</p>
          </div>

          <div className="flex-1 bg-white/8 rounded-[1vw] p-[2vw] border border-white/10">
            <span className="font-body font-bold text-accent" style={{ fontSize: "1.3vw" }}>Facility Costs</span>
            <div className="flex items-end gap-[0.5vw] mt-[1vh]">
              <span className="font-display text-white" style={{ fontSize: "3.5vw", lineHeight: 1 }}>&#8804;25%</span>
            </div>
            <p className="font-body text-white/50 mt-[0.5vh]" style={{ fontSize: "1.3vw" }}>of total expenses</p>
          </div>

          <div className="flex-1 bg-white/8 rounded-[1vw] p-[2vw] border border-white/10">
            <span className="font-body font-bold text-blue" style={{ fontSize: "1.3vw" }}>DSCR (Debt Service)</span>
            <div className="flex items-end gap-[0.5vw] mt-[1vh]">
              <span className="font-display text-white" style={{ fontSize: "3.5vw", lineHeight: 1 }}>&#8805;1.15x</span>
            </div>
            <p className="font-body text-white/50 mt-[0.5vh]" style={{ fontSize: "1.3vw" }}>coverage ratio</p>
          </div>
        </div>

        <div className="flex gap-[3vw]">
          <div className="flex items-start gap-[1vw]">
            <div className="w-[0.4vw] h-[5vh] rounded-full bg-primary mt-[0.3vh]" />
            <div>
              <span className="font-body font-bold text-white" style={{ fontSize: "1.4vw" }}>Professional Export Packages</span>
              <p className="font-body text-white/50" style={{ fontSize: "1.3vw" }}>Designed specifically for lender review -- PDFs, workbooks, and shareable model links</p>
            </div>
          </div>
          <div className="flex items-start gap-[1vw]">
            <div className="w-[0.4vw] h-[5vh] rounded-full bg-blue mt-[0.3vh]" />
            <div>
              <span className="font-body font-bold text-white" style={{ fontSize: "1.4vw" }}>Space Cross-Referral</span>
              <p className="font-body text-white/50" style={{ fontSize: "1.3vw" }}>When facility costs are too high, Budget points founders to Space for alternatives</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
