export default function ClosingSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "linear-gradient(135deg, #1E293B 0%, #2D4A3E 50%, #328555 100%)" }}>
      <div className="absolute top-[15vh] left-[5vw] w-[30vw] h-[30vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(50,133,85,0.15) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[10vh] right-[8vw] w-[25vw] h-[25vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(217,119,6,0.08) 0%, transparent 70%)" }} />

      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-white/40 font-medium" style={{ fontSize: "1.3vw" }}>07</span>
      </div>

      <div className="flex flex-col items-center justify-center h-full text-center px-[10vw]">
        <span className="font-body font-bold text-primary/80 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.3vw" }}>Status: Beta — Free for All Users</span>

        <h2 className="font-display text-white leading-tight mb-[3vh]" style={{ fontSize: "4vw" }}>
          Every school deserves a clear financial plan.
        </h2>

        <div className="flex gap-[3vw] mb-[5vh]">
          <div className="text-center">
            <span className="font-body font-bold text-white/90" style={{ fontSize: "1.5vw" }}>Next Up</span>
            <div className="w-[12vw] h-[0.3vh] bg-primary/40 rounded-full mt-[0.8vh] mb-[1vh]" />
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Lender packet submission flow</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Multi-user collaboration</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Pricing strategy</p>
          </div>
          <div className="text-center">
            <span className="font-body font-bold text-white/90" style={{ fontSize: "1.5vw" }}>Recently Shipped</span>
            <div className="w-[12vw] h-[0.3vh] bg-accent/40 rounded-full mt-[0.8vh] mb-[1vh]" />
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>UX coaching co-pilot</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>Escalation override engine</p>
            <p className="font-body text-white/60" style={{ fontSize: "1.3vw" }}>5 K-12 archetype coverage</p>
          </div>
          <div className="text-center">
            <span className="font-body font-bold text-white/90" style={{ fontSize: "1.5vw" }}>Team Ask</span>
            <div className="w-[12vw] h-[0.3vh] bg-primary/40 rounded-full mt-[0.8vh] mb-[1vh]" />
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
