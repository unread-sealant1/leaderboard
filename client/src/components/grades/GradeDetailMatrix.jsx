import React, { useEffect, useState } from "react";
import { scoreColors, scoreScaleMeta } from "../../lib/scoreColors";
import "../../styles/grade-matrix.css";

function formatScore(value) {
  return scoreScaleMeta(value).display;
}

function compareRows(a, b) {
  const aAvg = a.programAvg == null ? -Infinity : Number(a.programAvg);
  const bAvg = b.programAvg == null ? -Infinity : Number(b.programAvg);
  if (bAvg !== aAvg) return bAvg - aAvg;
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

function ScoreCell({ value, isAverage = false, title = "", className = "" }) {
  if (value == null) {
    return <td className={`gradeMatrixCell ${isAverage ? "gradeMatrixAverage" : ""} ${className}`.trim()}>-</td>;
  }

  const tone = scoreColors(value);
  return (
    <td
      className={`gradeMatrixCell ${isAverage ? "gradeMatrixAverage" : ""} ${className}`.trim()}
      title={title}
      style={{ background: isAverage ? tone.avgBg : tone.bg, color: tone.text }}
    >
      {formatScore(value)}
    </td>
  );
}

export default function GradeDetailMatrix({
  detail,
  variant = "admin",
  pageSize = null,
  pageSwitchMs = 10000
}) {
  const metaColumns = [...(detail?.columns?.meta || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const webdevColumns = [...(detail?.columns?.webdev || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const orderedRows = [...(detail?.rows || [])].sort(compareRows).map((row, index) => ({
    ...row,
    rank: index + 1
  }));

  const pages = [];
  if (pageSize && pageSize > 0) {
    for (let i = 0; i < orderedRows.length; i += pageSize) {
      pages.push(orderedRows.slice(i, i + pageSize));
    }
  } else {
    pages.push(orderedRows);
  }

  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [orderedRows.length, metaColumns.length, webdevColumns.length, pageSize]);

  useEffect(() => {
    if (pages.length <= 1) return undefined;
    const timer = setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pages.length);
    }, pageSwitchMs);
    return () => clearInterval(timer);
  }, [pages.length, pageSwitchMs]);

  const rows = pages[pageIndex] || [];

  return (
    <div className={`gradeMatrix gradeMatrix-${variant}`}>
      <div className="gradeMatrixScroller">
        <table className="gradeMatrixTable">
          <thead>
            <tr className="gradeMatrixGroupRow">
              <th className="gradeMatrixFixedHead" rowSpan="2">Rank</th>
              <th className="gradeMatrixFixedHead gradeMatrixStudentHead" rowSpan="2">Student</th>
              <th className="gradeMatrixGroup gradeMatrixGroupMeta" colSpan={Math.max(metaColumns.length, 1)}>
                Meta Skills
              </th>
              <th className="gradeMatrixGroup gradeMatrixGroupMetaAvg gradeMatrixAverageDivider" rowSpan="2">Meta Average</th>
              <th className="gradeMatrixGroup gradeMatrixGroupWeb" colSpan={Math.max(webdevColumns.length, 1)}>
                Web Development
              </th>
              <th className="gradeMatrixGroup gradeMatrixGroupWebAvg gradeMatrixAverageDivider" rowSpan="2">Web Dev Average</th>
              <th className="gradeMatrixGroup gradeMatrixGroupProgram gradeMatrixAverageDivider" rowSpan="2">Program Average</th>
            </tr>
            <tr className="gradeMatrixSubRow">
              {metaColumns.length ? metaColumns.map((column) => (
                <th key={column.key} title={column.sourceLabel || ""}>Sp{column.order}</th>
              )) : <th>-</th>}
              {webdevColumns.length ? webdevColumns.map((column) => (
                <th key={column.key} title={column.sourceLabel || ""}>Sp{column.order}</th>
              )) : <th>-</th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="gradeMatrixRank">{row.rank}</td>
                <td className="gradeMatrixStudent">
                  <div className="gradeMatrixStudentName">{row.name}</div>
                  {variant === "tv" ? null : (
                    <div className="gradeMatrixStudentMeta">{row.team || "-"}</div>
                  )}
                </td>

                {metaColumns.length ? metaColumns.map((column) => (
                  <ScoreCell
                    key={column.key}
                    value={row.metaWeeks?.[column.key] ?? null}
                    title={column.sourceLabel || ""}
                  />
                )) : <td className="gradeMatrixCell">-</td>}
                <ScoreCell value={row.metaAvg} isAverage className="gradeMatrixAverageDivider" />

                {webdevColumns.length ? webdevColumns.map((column) => (
                  <ScoreCell
                    key={column.key}
                    value={row.webdevWeeks?.[column.key] ?? null}
                    title={column.sourceLabel || ""}
                  />
                )) : <td className="gradeMatrixCell">-</td>}

                <ScoreCell value={row.webdevAvg} isAverage className="gradeMatrixAverageDivider" />
                <ScoreCell value={row.programAvg} isAverage className="gradeMatrixAverageDivider" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages.length > 1 ? (
        <div className="gradeMatrixPager">
          Page {pageIndex + 1}/{pages.length}
        </div>
      ) : null}
    </div>
  );
}
