export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 01 — The Gap</span>
        </div>
        <span>02 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[16vh] flex flex-col gap-[2.5vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">The Problem We're Solving</div>
        <h2 className="font-display font-[800] text-[4.6vw] leading-[1.05] tracking-tight text-primary max-w-[70vw]" style={{ textWrap: "balance" }}>
          School founders are extraordinary educators. They are not CFOs.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[1vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[52vh] grid grid-cols-2 gap-x-[5vw] gap-y-[3vh]">
        <div className="flex gap-[1.2vw] items-start">
          <span className="font-display font-[600] text-[2vw] text-accent leading-none mt-[0.6vh]">01</span>
          <p className="text-[1.95vw] leading-[1.4] text-ink" style={{ textWrap: "pretty" }}>
            Lenders demand DSCR, 5-year pro formas, stress tests, evidence-anchored assumptions.
          </p>
        </div>
        <div className="flex gap-[1.2vw] items-start">
          <span className="font-display font-[600] text-[2vw] text-accent leading-none mt-[0.6vh]">02</span>
          <p className="text-[1.95vw] leading-[1.4] text-ink" style={{ textWrap: "pretty" }}>
            Founders arrive with a Google Sheet, a vision, and zero finance team.
          </p>
        </div>
        <div className="flex gap-[1.2vw] items-start">
          <span className="font-display font-[600] text-[2vw] text-accent leading-none mt-[0.6vh]">03</span>
          <p className="text-[1.95vw] leading-[1.4] text-ink" style={{ textWrap: "pretty" }}>
            The gap kills most applications before underwriting even reads them.
          </p>
        </div>
        <div className="flex gap-[1.2vw] items-start">
          <span className="font-display font-[600] text-[2vw] text-accent leading-none mt-[0.6vh]">04</span>
          <p className="text-[1.95vw] leading-[1.4] text-ink" style={{ textWrap: "pretty" }}>
            Every week spent rebuilding a model is a week not spent enrolling students.
          </p>
        </div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] bottom-[6vh] flex items-center justify-between border-t border-rule pt-[2vh]">
        <p className="font-display italic text-[1.85vw] text-primary max-w-[60vw]" style={{ textWrap: "pretty" }}>
          The Lending Lab can either teach finance one-on-one — or hand applicants a tool that does the structure for them.
        </p>
        <span className="text-[1.3vw] tracking-[0.25em] uppercase text-muted">Confidential</span>
      </div>
    </div>
  );
}
