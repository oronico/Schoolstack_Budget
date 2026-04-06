export default function ProblemSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "linear-gradient(180deg, #FAF9F7 0%, #F0EDE8 100%)" }}>
      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-muted font-medium" style={{ fontSize: "1.3vw" }}>02</span>
      </div>
      <div className="absolute top-0 right-0 w-[35vw] h-[35vh] rounded-bl-full" style={{ background: "linear-gradient(135deg, rgba(74,124,184,0.08) 0%, rgba(50,133,85,0.06) 100%)" }} />

      <div className="flex h-full">
        <div className="w-[55vw] flex flex-col justify-center pl-[6vw] pr-[3vw]">
          <span className="font-body font-bold text-accent uppercase tracking-widest mb-[1.5vh]" style={{ fontSize: "1.3vw" }}>The Problem</span>
          <h2 className="font-display text-text leading-tight mb-[3vh]" style={{ fontSize: "3.5vw" }}>
            School founders need financial models. Most lack finance backgrounds.
          </h2>
          <p className="font-body text-muted leading-relaxed mb-[3vh]" style={{ fontSize: "1.6vw" }}>
            Teachers, parents, and community leaders are starting schools across the country. Their options today: complex spreadsheets they didn't build, or consultants they can't afford.
          </p>
        </div>

        <div className="w-[45vw] flex flex-col justify-center pr-[5vw] gap-[2.5vh]">
          <div className="bg-white rounded-[1vw] p-[2vw] border border-text/5 shadow-sm">
            <span className="font-display text-blue" style={{ fontSize: "5vw", lineHeight: 1 }}>700+</span>
            <p className="font-body text-text font-semibold mt-[0.5vh]" style={{ fontSize: "1.5vw" }}>new charter schools approved annually in the U.S.</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2vw] border border-text/5 shadow-sm">
            <span className="font-display text-primary" style={{ fontSize: "5vw", lineHeight: 1 }}>95%</span>
            <p className="font-body text-text font-semibold mt-[0.5vh]" style={{ fontSize: "1.5vw" }}>of founders are educators first, not finance professionals</p>
          </div>
          <div className="bg-white rounded-[1vw] p-[2vw] border border-text/5 shadow-sm">
            <span className="font-display text-accent" style={{ fontSize: "5vw", lineHeight: 1 }}>$15K+</span>
            <p className="font-body text-text font-semibold mt-[0.5vh]" style={{ fontSize: "1.5vw" }}>typical cost to hire a consultant for financial modeling</p>
          </div>
        </div>
      </div>
    </div>
  );
}
