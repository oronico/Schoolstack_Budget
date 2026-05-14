export default function WhyHoldUp() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 03 — The Outputs</span>
        </div>
        <span>07 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">Why The Outputs Hold Up</div>
        <h2 className="font-display font-[800] text-[3.2vw] leading-[1.1] tracking-tight text-primary mt-[1.5vh] max-w-[80vw]" style={{ textWrap: "balance" }}>
          What separates this from a polished founder spreadsheet.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[40vh] grid grid-cols-[18vw_1fr] gap-y-[2.4vh] gap-x-[3vw]">
        <div className="font-display font-[700] text-[1.85vw] text-primary">Formula integrity</div>
        <p className="text-[1.7vw] leading-[1.4] text-ink border-l border-rule pl-[1.6vw]" style={{ textWrap: "pretty" }}>
          Every cell in the 26-tab workbook is linked, so a lender can run their own what-ifs on the same math.
        </p>

        <div className="font-display font-[700] text-[1.85vw] text-primary">Evidence anchoring</div>
        <p className="text-[1.7vw] leading-[1.4] text-ink border-l border-rule pl-[1.6vw]" style={{ textWrap: "pretty" }}>
          Every assumption is tagged Estimate / Quote / Signed Contract; lenders see the confidence behind each number.
        </p>

        <div className="font-display font-[700] text-[1.85vw] text-primary">Deterministic commentary</div>
        <p className="text-[1.7vw] leading-[1.4] text-ink border-l border-rule pl-[1.6vw]" style={{ textWrap: "pretty" }}>
          Narrative is engine-generated from the model, not free-form prose; no hallucinations, fully auditable.
        </p>

        <div className="font-display font-[700] text-[1.85vw] text-primary">Stress-tested by default</div>
        <p className="text-[1.7vw] leading-[1.4] text-ink border-l border-rule pl-[1.6vw]" style={{ textWrap: "pretty" }}>
          ESA delays, rent shocks, enrollment misses, wage inflation all run automatically.
        </p>

        <div className="font-display font-[700] text-[1.85vw] text-primary">Cross-engine parity</div>
        <p className="text-[1.7vw] leading-[1.4] text-ink border-l border-rule pl-[1.6vw]" style={{ textWrap: "pretty" }}>
          The PDF, the Excel, and the on-screen review reconcile to the same numbers, every time.
        </p>
      </div>
    </div>
  );
}
