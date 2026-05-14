export default function LendingLab() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 04 — The Ask</span>
        </div>
        <span>09 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">The Lending Lab Recommendation</div>
        <h2 className="font-display font-[800] text-[3vw] leading-[1.12] tracking-tight text-primary mt-[1.5vh] max-w-[82vw]" style={{ textWrap: "balance" }}>
          All Lending Lab applicants should be required — or at minimum strongly encouraged — to use Budget before submitting an application.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[46vh] grid grid-cols-2 gap-[5vw]">
        <div className="border-l-[3px] border-primary pl-[2vw]">
          <div className="text-[1.3vw] tracking-[0.25em] uppercase text-primary">For the Lab</div>
          <div className="flex flex-col gap-[1.6vh] mt-[2vh]">
            <p className="text-[1.7vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
              <span className="text-accent mr-[0.6vw]">·</span>A consistent, comparable model across every applicant in the pipeline.
            </p>
            <p className="text-[1.7vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
              <span className="text-accent mr-[0.6vw]">·</span>Underwriting time cut materially — assumptions, evidence, and stress tests already structured.
            </p>
            <p className="text-[1.7vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
              <span className="text-accent mr-[0.6vw]">·</span>Higher conversion from inquiry to fundable application.
            </p>
            <p className="text-[1.7vw] leading-[1.35] text-ink" style={{ textWrap: "pretty" }}>
              <span className="text-accent mr-[0.6vw]">·</span>A standing data asset on applicant financial maturity across the cohort.
            </p>
          </div>
        </div>

        <div className="border-l-[3px] border-accent pl-[2vw]">
          <div className="text-[1.3vw] tracking-[0.25em] uppercase text-accent">For the Founder</div>
          <div className="flex flex-col gap-[2vh] mt-[2vh] justify-center h-[32vh]">
            <p className="font-display italic font-[600] text-[2.8vw] leading-[1.15] text-primary" style={{ textWrap: "balance" }}>
              A model their banker will actually open.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
