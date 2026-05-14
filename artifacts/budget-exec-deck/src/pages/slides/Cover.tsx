export default function Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary text-bg font-body">
      <div className="absolute top-[6vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.4vw] tracking-[0.3em] uppercase text-bg/70">
        <div className="flex items-center gap-[1vw]">
          <span className="inline-block w-[0.8vw] h-[0.8vw] rounded-full bg-accent"></span>
          <span>Budget</span>
        </div>
        <span>Executive Brief · May 2026</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[28vh] flex flex-col gap-[3vh]">
        <div className="text-[1.6vw] tracking-[0.25em] uppercase text-accent">
          Office of the CEO &amp; CFO
        </div>
        <h1 className="font-display font-[800] text-[7.4vw] leading-[0.95] tracking-tight text-bg" style={{ textWrap: "balance" }}>
          From founder spreadsheet
          <span className="block text-accent">to lender-ready</span>
          <span className="block">in one sitting.</span>
        </h1>
      </div>

      <div className="absolute left-[6vw] right-[6vw] bottom-[10vh] flex items-end justify-between">
        <div className="max-w-[55vw] text-[1.9vw] leading-[1.45] text-bg/85" style={{ textWrap: "pretty" }}>
          The financial modeling platform every Lending Lab applicant should use.
        </div>
        <div className="text-right text-[1.4vw] tracking-[0.25em] uppercase text-bg/60">
          <div>SchoolStack</div>
          <div className="mt-[0.6vh] text-bg/40">Confidential</div>
        </div>
      </div>

      <div className="absolute left-[6vw] bottom-[6vh] w-[14vw] h-[0.25vh] bg-accent"></div>
    </div>
  );
}
