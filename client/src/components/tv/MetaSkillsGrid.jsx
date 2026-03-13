import React from "react";
import { scoreColors, scoreScaleMeta } from "../../lib/scoreColors";
import "../../styles/tv.css";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function Donut({ value }) {
  const scale = scoreScaleMeta(value);
  const pct = clamp(scale.progressPct, 0, 100);
  const colors = scoreColors(scale.value);
  return (
    <div className="tvDonut" style={{ "--p": pct, "--c": colors.ring }}>
      <div className="tvDonutInner">
        <div className="tvDonutValue" style={{ color: "#0B1220" }}>{scale.display}</div>
      </div>
    </div>
  );
}

function MetaSkillsGrid({ subtitle, data }) {
  const teams = data?.teams || [];
  const rows = data?.rows || [];

  if (!teams.length || !rows.length) {
    return <div className="tvEmpty">No data yet.</div>;
  }

  return (
    <div className="tvPanel tvMetaPanel">
      <div className="tvMetaSubtitle">{subtitle}</div>
      <div className="tvMetaGrid">
        <div />
        {teams.map((team) => (
          <div key={team} className="tvMetaTeam">
            {team}
          </div>
        ))}

        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <div className="tvMetaLabel">{row.label}</div>
            {row.values.map((value, idx) => (
              <div className="tvMetaCell" key={`${row.label}-${idx}`}>
                <Donut value={value} />
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default MetaSkillsGrid;
