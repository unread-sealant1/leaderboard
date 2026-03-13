import React from "react";
import { scoreColors, scoreScaleMeta } from "../../lib/scoreColors";
import "../../styles/grade-matrix.css";

function formatScore(value) {
  return scoreScaleMeta(value).display;
}

function compareRows(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

function SummaryCell({ value }) {
  if (value == null) {
    return <td className="gradeSummaryCell">-</td>;
  }

  const tone = scoreColors(value);
  return (
    <td className="gradeSummaryCell" style={{ background: tone.bg, color: tone.text }}>
      {formatScore(value)}
    </td>
  );
}

export default function GradebookSummaryTable({ rows = [] }) {
  const orderedRows = [...rows].sort(compareRows);

  return (
    <div className="gradeSummary">
      <div className="gradeSummaryScroller">
        <table className="gradeSummaryTable">
          <thead>
            <tr>
              <th className="gradeSummaryStudentHead">Student</th>
              <th>Meta Skills</th>
              <th>Web Development</th>
              <th>Coaching</th>
              <th>Project Portfolio</th>
              <th className="gradeSummaryProgramHead">Program Average</th>
            </tr>
          </thead>

          <tbody>
            {orderedRows.map((row) => (
              <tr key={row.id}>
                <td className="gradeSummaryStudent">
                  <div className="gradeSummaryStudentName">{row.name || "-"}</div>
                  <div className="gradeSummaryStudentMeta">{row.teamName || row.team || "-"}</div>
                </td>
                <SummaryCell value={row.streamScores?.meta ?? null} />
                <SummaryCell value={row.streamScores?.webdev ?? null} />
                <SummaryCell value={row.streamScores?.coaching ?? null} />
                <SummaryCell value={row.streamScores?.portfolio ?? null} />
                <SummaryCell value={row.avg ?? row.programAvg ?? null} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
