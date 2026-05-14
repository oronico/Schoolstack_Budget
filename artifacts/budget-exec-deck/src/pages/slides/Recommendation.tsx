export default function Recommendation() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary text-bg font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-bg/60">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-bg">Budget</span>
          <span className="text-bg/30">·</span>
          <span>Section 04 — The Ask</span>
        </div>
        <span>10 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">Recommendation</div>
        <h2 className="font-display font-[800] text-[3.4vw] leading-[1.1] tracking-tight text-bg mt-[1.5vh] max-w-[78vw]" style={{ textWrap: "balance" }}>
          A three-step adoption plan.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[40vh] flex flex-col gap-[3vh]">
        <div className="grid grid-cols-[6vw_1fr] gap-[2vw] items-baseline border-b border-bg/15 pb-[2.4vh]">
          <span className="font-display font-[800] text-[4vw] text-accent leading-none">01</span>
          <p className="text-[2.05vw] leading-[1.35] text-bg" style={{ textWrap: "pretty" }}>
            Adopt Budget as the standard pre-application tool for the Lending Lab cohort.
          </p>
        </div>
        <div className="grid grid-cols-[6vw_1fr] gap-[2vw] items-baseline border-b border-bg/15 pb-[2.4vh]">
          <span className="font-display font-[800] text-[4vw] text-accent leading-none">02</span>
          <p className="text-[2.05vw] leading-[1.35] text-bg" style={{ textWrap: "pretty" }}>
            Embed the export artifacts (Lender Packet, Underwriting Workbook, Loan Readiness Scorecard) directly into the underwriting checklist.
          </p>
        </div>
        <div className="grid grid-cols-[6vw_1fr] gap-[2vw] items-baseline pb-[1vh]">
          <span className="font-display font-[800] text-[4vw] text-accent leading-none">03</span>
          <p className="text-[2.05vw] leading-[1.35] text-bg" style={{ textWrap: "pretty" }}>
            Track adoption and downstream conversion as a leading indicator for portfolio health.
          </p>
        </div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] bottom-[6vh] border-t border-bg/20 pt-[2vh] flex items-center justify-between">
        <p className="font-display italic text-[1.7vw] text-bg/85 max-w-[60vw]" style={{ textWrap: "pretty" }}>
          The institutional memory — engineering runbook and lending-lab operations runbook — ships alongside this deck.
        </p>
        <span className="text-[1.3vw] tracking-[0.25em] uppercase text-bg/50">SchoolStack · Confidential</span>
      </div>
    </div>
  );
}
