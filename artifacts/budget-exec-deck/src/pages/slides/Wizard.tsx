export default function Wizard() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 02 — The Product</span>
        </div>
        <span>04 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">The 12-Step Wizard</div>
        <h2 className="font-display font-[800] text-[3.4vw] leading-[1.1] tracking-tight text-primary mt-[1.5vh] max-w-[78vw]" style={{ textWrap: "balance" }}>
          Founders move through a single linear path. Each step does the heavy math invisibly.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[40vh] grid grid-cols-4 gap-x-[2vw] gap-y-[2.4vh]">
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">01</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Story</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">02</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">School Details</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">03</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Enrollment</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">04</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Revenue</div>
        </div>

        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">05</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Staffing</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">06</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Expenses</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">07</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Capital &amp; Financing</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">08</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Assumptions &amp; Evidence</div>
        </div>

        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">09</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Real-Time Review</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">10</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Consultant Analysis</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">11</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Lender Narrative</div>
        </div>
        <div className="border-t-2 border-primary pt-[1.5vh]">
          <div className="font-display font-[600] text-[1.6vw] text-accent">12</div>
          <div className="text-[1.7vw] font-[500] mt-[0.4vh]">Export</div>
        </div>
      </div>

      <div className="absolute left-[6vw] right-[6vw] bottom-[5vh] border-t border-rule pt-[2vh] flex items-center justify-between">
        <p className="text-[1.7vw] leading-[1.4] max-w-[68vw] text-ink" style={{ textWrap: "pretty" }}>
          <span className="text-muted uppercase tracking-[0.2em] text-[1.2vw] block mb-[0.6vh]">Under the hood</span>
          Payroll tax caps · fully-loaded benefits · smart escalation · per-pupil funding mix · ESA timing — all handled.
        </p>
        <p className="font-display italic text-[1.5vw] text-primary text-right max-w-[24vw]" style={{ textWrap: "pretty" }}>
          The founder never sees a formula they didn't ask for.
        </p>
      </div>
    </div>
  );
}
