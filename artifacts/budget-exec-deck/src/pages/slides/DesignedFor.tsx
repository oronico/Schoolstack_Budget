export default function DesignedFor() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink font-body">
      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between text-[1.3vw] tracking-[0.3em] uppercase text-muted">
        <div className="flex items-center gap-[0.8vw]">
          <span className="inline-block w-[0.7vw] h-[0.7vw] rounded-full bg-accent"></span>
          <span className="text-primary">Budget</span>
          <span className="text-rule">·</span>
          <span>Section 02 — The Product</span>
        </div>
        <span>05 / 10</span>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[14vh]">
        <div className="text-[1.3vw] tracking-[0.3em] uppercase text-accent">Designed For The Reality</div>
        <h2 className="font-display font-[800] text-[3.2vw] leading-[1.1] tracking-tight text-primary mt-[1.5vh] max-w-[80vw]" style={{ textWrap: "balance" }}>
          Built for leaders with limited time and limited finance background.
        </h2>
        <div className="w-[10vw] h-[0.25vh] bg-accent mt-[2vh]"></div>
        <p className="text-[1.7vw] text-muted mt-[2vh] max-w-[70vw]" style={{ textWrap: "pretty" }}>
          Four design choices make the difference.
        </p>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[42vh] grid grid-cols-2 gap-x-[4vw] gap-y-[4vh]">
        <div className="border-l-2 border-accent pl-[1.6vw]">
          <div className="font-display font-[800] text-[2.8vw] text-primary leading-none">I.</div>
          <div className="text-[1.9vw] font-[500] text-primary mt-[1vh]" style={{ textWrap: "balance" }}>
            Just-in-time micro-lessons
          </div>
          <p className="text-[1.65vw] leading-[1.4] text-ink/85 mt-[0.8vh]" style={{ textWrap: "pretty" }}>
            Coaching cards fire when the data triggers them — e.g. "Your budget isn't your cash flow."
          </p>
        </div>
        <div className="border-l-2 border-accent pl-[1.6vw]">
          <div className="font-display font-[800] text-[2.8vw] text-primary leading-none">II.</div>
          <div className="text-[1.9vw] font-[500] text-primary mt-[1vh]" style={{ textWrap: "balance" }}>
            Founder persona system
          </div>
          <p className="text-[1.65vw] leading-[1.4] text-ink/85 mt-[0.8vh]" style={{ textWrap: "pretty" }}>
            Tone and depth shift between "New to budgeting" and "Comfortable."
          </p>
        </div>
        <div className="border-l-2 border-accent pl-[1.6vw]">
          <div className="font-display font-[800] text-[2.8vw] text-primary leading-none">III.</div>
          <div className="text-[1.9vw] font-[500] text-primary mt-[1vh]" style={{ textWrap: "balance" }}>
            Quick-Start single-year mode
          </div>
          <p className="text-[1.65vw] leading-[1.4] text-ink/85 mt-[0.8vh]" style={{ textWrap: "pretty" }}>
            A lean founder lands a usable budget in one sitting, then expands to 5-year for lender readiness.
          </p>
        </div>
        <div className="border-l-2 border-accent pl-[1.6vw]">
          <div className="font-display font-[800] text-[2.8vw] text-primary leading-none">IV.</div>
          <div className="text-[1.9vw] font-[500] text-primary mt-[1vh]" style={{ textWrap: "balance" }}>
            Demo data and seed flows
          </div>
          <p className="text-[1.65vw] leading-[1.4] text-ink/85 mt-[0.8vh]" style={{ textWrap: "pretty" }}>
            Applicants explore the product fully populated before touching their own numbers.
          </p>
        </div>
      </div>
    </div>
  );
}
