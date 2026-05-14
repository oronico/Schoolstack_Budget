export default function WhatBudgetIs() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 01 — The Gap</span>
        </div>
        <span>03 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[16vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">What Budget Is</div>
        <h2 className="font-display font-[800] text-[3.6vw] leading-[1.1] tracking-tight text-primary mt-[2vh] max-w-[80vw]" style={{ textWrap: "balance" }}>
          A guided, 12-step financial modeling experience that produces lender-grade outputs from the same inputs a non-financial founder can confidently provide.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[3vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[64vh] grid grid-cols-[1.6fr_1fr] gap-[5vw]">
        <div className="flex flex-col gap-[2.4vh]">
          <div className="flex gap-[1.2vw] items-start">
            <span className="text-accent font-display font-[600] text-[1.8vw] leading-none mt-[0.6vh]">·</span>
            <p className="text-[1.85vw] leading-[1.4]" style={{ textWrap: "pretty" }}>
              Adapts to school type (charter, private, microschool, learning lab) and stage (startup vs. operating).
            </p>
          </div>
          <div className="flex gap-[1.2vw] items-start">
            <span className="text-accent font-display font-[600] text-[1.8vw] leading-none mt-[0.6vh]">·</span>
            <p className="text-[1.85vw] leading-[1.4]" style={{ textWrap: "pretty" }}>
              Translates plain-language inputs into a full 5-year model with DSCR, DCOH, sensitivity, and audit trail.
            </p>
          </div>
          <div className="flex gap-[1.2vw] items-start">
            <span className="text-accent font-display font-[600] text-[1.8vw] leading-none mt-[0.6vh]">·</span>
            <p className="text-[1.85vw] leading-[1.4]" style={{ textWrap: "pretty" }}>
              Replaces a $15–25K consulting engagement with a 90-minute self-serve flow.
            </p>
          </div>
        </div>

        <div className="border-l-2 border-accent pl-[2vw] flex flex-col justify-center">
          <div className="text-[1.2vw] tracking-[0.3em] uppercase text-muted">Exhibit</div>
          <div className="font-display font-[800] text-[5.2vw] leading-[1] text-primary mt-[1vh]">90<span className="text-accent">min</span></div>
          <div className="text-[1.5vw] leading-[1.35] text-ink mt-[1vh]" style={{ textWrap: "pretty" }}>
            Median time from blank model to first lender-ready export.
          </div>
        </div>
      </div>
    </div>
  );
}
