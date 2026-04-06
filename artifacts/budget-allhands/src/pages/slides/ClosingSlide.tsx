const base = import.meta.env.BASE_URL;

export default function ClosingSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <img
        src={`${base}closing-school.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
        alt="School campus"
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(30,41,59,0.88) 0%, rgba(50,133,85,0.75) 100%)" }} />

      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-white/40 font-medium" style={{ fontSize: "1.3vw" }}>07</span>
      </div>

      <div className="flex flex-col items-center justify-center h-full text-center px-[10vw]">
        <span className="font-body font-bold text-primary/80 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.3vw" }}>Status: Beta -- Free for All Users</span>

        <h2 className="font-display text-white leading-tight mb-[3vh]" style={{ fontSize: "4vw" }}>
          Every school deserves a clear financial plan.
        </h2>

        <div className="flex gap-[3vw] mb-[5vh]">
          <div className="text-center">
            <span className="font-body font-bold text-white/90" style={{ fontSize: "1.5vw" }}>Next Up</span>
            <div className="w-[12vw] h-[0.3vh] bg-primary/40 rounded-full mt-[0.8vh] mb-[1vh]" />
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Expert review workflow</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Lending Lab integration</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Pricing strategy</p>
          </div>
          <div className="text-center">
            <span className="font-body font-bold text-white/90" style={{ fontSize: "1.5vw" }}>Team Ask</span>
            <div className="w-[12vw] h-[0.3vh] bg-accent/40 rounded-full mt-[0.8vh] mb-[1vh]" />
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Try the tool yourself</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Share with school founders</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Send us feedback</p>
          </div>
        </div>

        <div className="flex items-center gap-[1vw]">
          <div className="w-[3vw] h-[3vw] rounded-full bg-primary flex items-center justify-center">
            <span className="font-display text-white" style={{ fontSize: "1.6vw" }}>S</span>
          </div>
          <span className="font-body font-bold text-white/90" style={{ fontSize: "1.8vw", letterSpacing: "0.08em" }}>SCHOOLSTACK</span>
        </div>
        <p className="font-body text-white/40 mt-[1.5vh]" style={{ fontSize: "1.2vw" }}>budget.schoolstack.ai  &#183;  space.schoolstack.ai  &#183;  lendinglab.org</p>
      </div>
    </div>
  );
}
