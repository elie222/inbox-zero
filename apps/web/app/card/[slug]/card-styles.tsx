import { cardColors, farStars, nearStars } from "./card-theme";

// Keyframes and the animated sky. Kept out of the client component so the
// markup there stays readable.
export function CardStyles() {
  return (
    <style>{`
@keyframes twinkle{0%,100%{opacity:.9}50%{opacity:.15}}
@keyframes drift{0%{transform:translateY(0)}100%{transform:translateY(-140px)}}
@keyframes shoot{0%{transform:translate(0,0) rotate(-35deg);opacity:0}5%{opacity:1}18%{transform:translate(-420px,294px) rotate(-35deg);opacity:0}100%{transform:translate(-420px,294px) rotate(-35deg);opacity:0}}
@keyframes nebula{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,20px) scale(1.12)}}
.card-link{color:${cardColors.text};text-decoration:none}
.card-row:hover{background:${cardColors.panelAlt}}
.card-chip:hover{border-color:${cardColors.accent}}
.card-accent-btn:hover{background:${cardColors.accentHover}}
.card-outline-btn:hover{border-color:${cardColors.accent};color:${cardColors.accent}}
.card-field:focus{outline:none;border-color:${cardColors.accent}}
@media (prefers-reduced-motion:reduce){
  .card-sky *{animation:none !important}
}
`}</style>
  );
}

export function CardSky() {
  return (
    <div
      aria-hidden="true"
      className="card-sky"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <div
        style={{
          position: "absolute",
          top: -260,
          left: "50%",
          marginLeft: -500,
          width: 1000,
          height: 620,
          background:
            "radial-gradient(closest-side,rgba(255,107,61,.16),rgba(227,85,42,.05) 55%,transparent 75%)",
          animation: "nebula 18s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -320,
          right: -220,
          width: 760,
          height: 560,
          background:
            "radial-gradient(closest-side,rgba(245,185,66,.09),transparent 70%)",
          animation: "nebula 24s ease-in-out infinite reverse",
        }}
      />
      <StarLayer stars={farStars} driftSeconds={90} />
      <StarLayer stars={nearStars} driftSeconds={55} />
      <div
        style={{
          position: "absolute",
          top: "8%",
          right: "6%",
          width: 90,
          height: 2,
          background: `linear-gradient(90deg,transparent,${cardColors.text})`,
          borderRadius: 2,
          animation: "shoot 11s ease-in 3s infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "55%",
          right: "-4%",
          width: 70,
          height: 2,
          background: `linear-gradient(90deg,transparent,${cardColors.accent})`,
          borderRadius: 2,
          animation: "shoot 17s ease-in 9s infinite",
        }}
      />
    </div>
  );
}

function StarLayer({
  stars,
  driftSeconds,
}: {
  stars: typeof farStars;
  driftSeconds: number;
}) {
  return (
    <div style={{ animation: `drift ${driftSeconds}s linear infinite` }}>
      <div style={{ position: "absolute", inset: 0 }}>
        {stars.map((star) => (
          <div
            key={`${star.left}-${star.top}-${star.size}`}
            style={{
              position: "absolute",
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              borderRadius: "50%",
              background: star.color,
              opacity: star.opacity,
              animation: star.animation,
            }}
          />
        ))}
      </div>
    </div>
  );
}
