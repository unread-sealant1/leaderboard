import React from "react";
import { scoreColors, scoreScaleMeta } from "../../lib/scoreColors";
import "../../styles/tv.css";

function TeamCard({ name, score }) {
  const numericScore = score == null ? Number.NaN : score;
  const colors = scoreColors(numericScore);
  const scale = scoreScaleMeta(numericScore);

  return (
    <div className="tvCard">
      <div className="tvCardTop">
        <div className="tvCardTitle">{name}</div>
        <div className="tvPill" style={{ color: "#0B1220" }}>
          {scale.display}
        </div>
      </div>
      <div className="tvRingWrap">
        <div className="tvRing" style={{ "--p": scale.progressPct, "--c": colors.ring }}>
          <div className="tvRingInner">
            <div className="tvRingScore" style={{ color: "#0B1220" }}>
              {scale.display}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamDialsGrid({
  teamScores = [],
  heading = "",
  subheading = ""
}) {
  const scoreByName = {};
  teamScores.forEach((r) => {
    scoreByName[r.team] = r.score;
  });

  const slots = [
    { slot: "leftTop", name: "Team 1" },
    { slot: "rightTop", name: "Team 2" },
    { slot: "leftBottom", name: "Team 3" },
    { slot: "rightBottom", name: "Team 4" }
  ];

  return (
    <div className="tvDialScreen">
      {heading ? (
        <div className="tvDialHeader">
          <div className="tvDialHeading">{heading}</div>
          {subheading ? <div className="tvDialSubheading">{subheading}</div> : null}
        </div>
      ) : null}

      <div className="tvGrid">
        {slots.map((t) => (
          <div key={t.slot} className={`tvSlot ${t.slot}`}>
            <TeamCard
              name={t.name}
              score={Object.prototype.hasOwnProperty.call(scoreByName, t.name) ? scoreByName[t.name] : null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
