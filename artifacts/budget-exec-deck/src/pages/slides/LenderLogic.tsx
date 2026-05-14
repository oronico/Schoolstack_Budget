export default function LenderLogic() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 03 — The Outputs</span>
        </div>
        <span>08 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">Built-In Lender Logic</div>
        <h2 className="font-display font-[800] text-[3.4vw] leading-[1.1] tracking-tight text-primary mt-[1.5vh] max-w-[78vw]" style={{ textWrap: "balance" }}>
          Budget speaks the language credit committees actually use.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
      </div>

      <div className="absolute left-[6vw] top-[42vh] w-[44vw] flex flex-col gap-[2.4vh]">
        <div>
          <div className="text-[1.4vw] tracking-[0.25em] uppercase text-accent">DSCR</div>
          <p className="text-[1.75vw] leading-[1.4] text-ink mt-[0.4vh]" style={{ textWrap: "pretty" }}>
            Debt Service Coverage Ratio — calculated to bank standard, surfaced in real time.
          </p>
        </div>
        <div>
          <div className="text-[1.4vw] tracking-[0.25em] uppercase text-accent">DCOH</div>
          <p className="text-[1.75vw] leading-[1.4] text-ink mt-[0.4vh]" style={{ textWrap: "pretty" }}>
            Days Cash on Hand — tracked across the 5-year horizon, with the trough flagged.
          </p>
        </div>
        <div>
          <div className="text-[1.4vw] tracking-[0.25em] uppercase text-accent">Scenario Engine</div>
          <p className="text-[1.75vw] leading-[1.4] text-ink mt-[0.4vh]" style={{ textWrap: "pretty" }}>
            Flip enrollment, wage inflation, collection rate; see DSCR and DCOH respond instantly.
          </p>
        </div>
        <div>
          <div className="text-[1.4vw] tracking-[0.25em] uppercase text-accent">Loan Readiness Verdict</div>
          <p className="text-[1.75vw] leading-[1.4] text-ink mt-[0.4vh]" style={{ textWrap: "pretty" }}>
            A clear Strong / Adequate / Needs Work signal before the application is submitted.
          </p>
        </div>
      </div>

      <div className="absolute right-[6vw] top-[42vh] w-[36vw] h-[44vh] bg-primary text-bg p-[2.4vw] flex flex-col justify-between">
        <div>
          <div className="text-[1.2vw] tracking-[0.3em] uppercase text-bg/60">Exhibit · Live Dashboard</div>
          <div className="font-display font-[800] text-[2.2vw] mt-[1vh] leading-[1.15]" style={{ textWrap: "balance" }}>
            DSCR &amp; DCOH at a glance
          </div>
        </div>

        <div className="flex flex-col gap-[1.4vh]">
          <div className="flex items-baseline justify-between border-b border-bg/20 pb-[1vh]">
            <span className="text-[1.4vw] uppercase tracking-[0.2em] text-bg/70">DSCR Yr 1</span>
            <span className="font-display font-[800] text-[3vw] text-accent leading-none">1.42<span className="text-[1.4vw] text-bg/60 ml-[0.4vw]">×</span></span>
          </div>
          <div className="flex items-baseline justify-between border-b border-bg/20 pb-[1vh]">
            <span className="text-[1.4vw] uppercase tracking-[0.2em] text-bg/70">DSCR Yr 5</span>
            <span className="font-display font-[800] text-[3vw] text-accent leading-none">2.18<span className="text-[1.4vw] text-bg/60 ml-[0.4vw]">×</span></span>
          </div>
          <div className="flex items-baseline justify-between border-b border-bg/20 pb-[1vh]">
            <span className="text-[1.4vw] uppercase tracking-[0.2em] text-bg/70">DCOH trough</span>
            <span className="font-display font-[800] text-[3vw] text-accent leading-none">63<span className="text-[1.4vw] text-bg/60 ml-[0.4vw]">days</span></span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[1.4vw] uppercase tracking-[0.2em] text-bg/70">Verdict</span>
            <span className="font-display font-[800] text-[2vw] text-bg leading-none">Strong</span>
          </div>
        </div>

        <div className="text-[1.1vw] text-bg/50 italic" style={{ textWrap: "pretty" }}>
          Illustrative — figures vary by school model.
        </div>
      </div>
    </div>
  );
}
