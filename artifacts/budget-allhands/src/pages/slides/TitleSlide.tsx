const base = import.meta.env.BASE_URL;

export default function TitleSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <img
        src={`${base}hero-school.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
        alt="Inspiring school setting"
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(30,41,59,0.82) 0%, rgba(50,133,85,0.7) 100%)" }} />
      <div className="absolute top-[3vh] left-[5vw] flex items-center gap-[1vw]">
        <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-primary flex items-center justify-center">
          <span className="font-display text-white" style={{ fontSize: "1.4vw" }}>S</span>
        </div>
        <span className="font-body font-bold text-white/90" style={{ fontSize: "1.4vw", letterSpacing: "0.05em" }}>SCHOOLSTACK</span>
      </div>
      <div className="absolute bottom-[8vh] left-[5vw] right-[10vw]">
        <div className="mb-[2vh]">
          <span className="inline-block bg-primary/30 text-white/90 font-body font-semibold px-[1.2vw] py-[0.5vh] rounded-full" style={{ fontSize: "1.3vw" }}>
            Friday All-Hands  --  April 2026
          </span>
        </div>
        <h1 className="font-display text-white leading-tight mb-[2vh]" style={{ fontSize: "4.8vw" }}>
          SchoolStack Budget
        </h1>
        <p className="font-body text-white/80 font-medium leading-snug max-w-[50vw]" style={{ fontSize: "2.2vw" }}>
          Building the CFO in a Box for School Founders
        </p>
      </div>
      <div className="absolute bottom-[3vh] right-[5vw]">
        <span className="font-body text-white/50" style={{ fontSize: "1.2vw" }}>budget.schoolstack.ai</span>
      </div>
    </div>
  );
}
