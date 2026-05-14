export default function OutputSuite() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 03 — The Outputs</span>
        </div>
        <span>06 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">The Lender-Grade Output Suite</div>
        <h2 className="font-display font-[800] text-[3.2vw] leading-[1.1] tracking-tight text-primary mt-[1.5vh] max-w-[80vw]" style={{ textWrap: "balance" }}>
          Five export artifacts, each engineered to the standard a credit committee expects.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[40vh] flex flex-col gap-[2.2vh]">
        <div className="grid grid-cols-[3vw_18vw_8vw_1fr] gap-[1.6vw] items-baseline border-b border-rule pb-[1.6vh]">
          <span className="font-display font-[600] text-[1.7vw] text-accent">I</span>
          <span className="text-[1.85vw] font-[700] text-primary">Lender Packet</span>
          <span className="text-[1.4vw] uppercase tracking-[0.2em] text-muted">PDF</span>
          <span className="text-[1.6vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
            20+ sections · evidence-anchored assumptions · deterministic commentary.
          </span>
        </div>
        <div className="grid grid-cols-[3vw_18vw_8vw_1fr] gap-[1.6vw] items-baseline border-b border-rule pb-[1.6vh]">
          <span className="font-display font-[600] text-[1.7vw] text-accent">II</span>
          <span className="text-[1.85vw] font-[700] text-primary">Underwriting Workbook</span>
          <span className="text-[1.4vw] uppercase tracking-[0.2em] text-muted">Excel</span>
          <span className="text-[1.6vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
            26 tabs · formula-linked · zero hardcoded cells.
          </span>
        </div>
        <div className="grid grid-cols-[3vw_18vw_8vw_1fr] gap-[1.6vw] items-baseline border-b border-rule pb-[1.6vh]">
          <span className="font-display font-[600] text-[1.7vw] text-accent">III</span>
          <span className="text-[1.85vw] font-[700] text-primary">Board Packet</span>
          <span className="text-[1.4vw] uppercase tracking-[0.2em] text-muted">PDF</span>
          <span className="text-[1.6vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
            Governance-framed · action items for non-financial trustees.
          </span>
        </div>
        <div className="grid grid-cols-[3vw_18vw_8vw_1fr] gap-[1.6vw] items-baseline border-b border-rule pb-[1.6vh]">
          <span className="font-display font-[600] text-[1.7vw] text-accent">IV</span>
          <span className="text-[1.85vw] font-[700] text-primary">Loan Readiness Scorecard</span>
          <span className="text-[1.4vw] uppercase tracking-[0.2em] text-muted">PDF</span>
          <span className="text-[1.6vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
            7-dimension verdict with explanation.
          </span>
        </div>
        <div className="grid grid-cols-[3vw_18vw_8vw_1fr] gap-[1.6vw] items-baseline pb-[0.6vh]">
          <span className="font-display font-[600] text-[1.7vw] text-accent">V</span>
          <span className="text-[1.85vw] font-[700] text-primary">Decision Comparison</span>
          <span className="text-[1.4vw] uppercase tracking-[0.2em] text-muted">PDF</span>
          <span className="text-[1.6vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
            Side-by-side strategic options against the 5-year trough.
          </span>
        </div>
      </div>
    </div>
  );
}
