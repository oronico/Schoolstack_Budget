export default function EcosystemSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "linear-gradient(180deg, #FAF9F7 0%, #F0EDE8 100%)" }}>
      <div className="absolute top-[3vh] right-[5vw]">
        <span className="font-body text-muted font-medium" style={{ fontSize: "1.3vw" }}>05</span>
      </div>

      <div className="flex flex-col h-full px-[6vw] pt-[6vh]">
        <span className="font-body font-bold text-blue uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1.3vw" }}>The SchoolStack Ecosystem</span>
        <h2 className="font-display text-text leading-tight mb-[5vh]" style={{ fontSize: "3.2vw" }}>
          Three products. One mission.
        </h2>

        <div className="flex items-center justify-center flex-1 relative">
          <div className="absolute w-[30vw] h-[30vw] rounded-full border-2 border-dashed border-text/8" />

          <div className="absolute top-[2vh] left-[50%] -translate-x-1/2">
            <div className="bg-text rounded-[1vw] p-[2vw] w-[24vw] text-center shadow-lg">
              <span className="font-display text-white" style={{ fontSize: "2vw" }}>schoolstack.ai</span>
              <p className="font-body text-white/60 mt-[0.5vh]" style={{ fontSize: "1.3vw" }}>Parent brand and suite hub</p>
            </div>
          </div>

          <div className="absolute bottom-[6vh] left-[3vw]">
            <div className="bg-white rounded-[1vw] p-[2vw] w-[26vw] border-2 border-primary shadow-sm">
              <div className="flex items-center gap-[0.8vw] mb-[1vh]">
                <div className="w-[2.5vw] h-[2.5vw] rounded-[0.5vw] bg-primary flex items-center justify-center">
                  <span className="font-body font-bold text-white" style={{ fontSize: "1.2vw" }}>B</span>
                </div>
                <div>
                  <span className="font-body font-bold text-text" style={{ fontSize: "1.5vw" }}>SchoolStack Budget</span>
                  <p className="font-body text-muted" style={{ fontSize: "1.2vw" }}>budget.schoolstack.ai</p>
                </div>
              </div>
              <p className="font-body text-text/70" style={{ fontSize: "1.3vw" }}>Financial modeling and lender readiness</p>
            </div>
          </div>

          <div className="absolute bottom-[6vh] right-[3vw]">
            <div className="bg-white rounded-[1vw] p-[2vw] w-[26vw] border-2 border-blue shadow-sm">
              <div className="flex items-center gap-[0.8vw] mb-[1vh]">
                <div className="w-[2.5vw] h-[2.5vw] rounded-[0.5vw] bg-blue flex items-center justify-center">
                  <span className="font-body font-bold text-white" style={{ fontSize: "1.2vw" }}>S</span>
                </div>
                <div>
                  <span className="font-body font-bold text-text" style={{ fontSize: "1.5vw" }}>SchoolStack Space</span>
                  <p className="font-body text-muted" style={{ fontSize: "1.2vw" }}>space.schoolstack.ai</p>
                </div>
              </div>
              <p className="font-body text-text/70" style={{ fontSize: "1.3vw" }}>Facility planning and property evaluation</p>
            </div>
          </div>

          <div className="absolute top-[18vh] right-[10vw]">
            <div className="bg-amber-50 rounded-[1vw] p-[2vw] w-[24vw] border-2 border-accent shadow-sm">
              <div className="flex items-center gap-[0.8vw] mb-[1vh]">
                <div className="w-[2.5vw] h-[2.5vw] rounded-[0.5vw] bg-accent flex items-center justify-center">
                  <span className="font-body font-bold text-white" style={{ fontSize: "1.2vw" }}>L</span>
                </div>
                <div>
                  <span className="font-body font-bold text-text" style={{ fontSize: "1.5vw" }}>The Lending Lab</span>
                  <p className="font-body text-muted" style={{ fontSize: "1.2vw" }}>lendinglab.org</p>
                </div>
              </div>
              <p className="font-body text-text/70" style={{ fontSize: "1.3vw" }}>Building Hope Impact Fund lending portal</p>
            </div>
          </div>

          <div className="absolute top-[18vh] left-[8vw]">
            <svg width="6vw" height="8vh" viewBox="0 0 100 80" className="text-primary/30">
              <path d="M80 10 L50 70" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" fill="none" />
              <polygon points="47,65 53,65 50,75" fill="currentColor" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
