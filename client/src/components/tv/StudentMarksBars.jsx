import React from "react";
import GradeDetailMatrix from "../grades/GradeDetailMatrix";
import "../../styles/tv.css";

export function StudentMarksBars({ students }) {
  const detail = students && typeof students === "object" && !Array.isArray(students)
    ? students
    : { rows: Array.isArray(students) ? students : [], columns: { meta: [], webdev: [] } };

  const hasColumns = (detail.columns?.meta || []).length || (detail.columns?.webdev || []).length;
  const hasRows = (detail.rows || []).length;

  if (!hasColumns) {
    return (
      <div className="tvPanel">
        <div className="tvPanelTitle">Individual Marks</div>
        <div className="tvPanelSub">Weekly score matrix for Meta Skills and Web Development.</div>
        <div className="tvEmpty">No weekly grade columns available for this term.</div>
      </div>
    );
  }

  if (!hasRows) {
    return (
      <div className="tvPanel">
        <div className="tvPanelTitle">Individual Marks</div>
        <div className="tvPanelSub">Weekly score matrix for Meta Skills and Web Development.</div>
        <div className="tvEmpty">No student marks available yet.</div>
      </div>
    );
  }

  return (
    <div className="tvPanel">
      <div className="tvPanelTitle">Individual Marks</div>
      <div className="tvPanelSub">Spreadsheet-style weekly detail view for Meta Skills and Web Development.</div>
      <GradeDetailMatrix detail={detail} variant="tv" pageSize={20} pageSwitchMs={10000} />
    </div>
  );
}

export default StudentMarksBars;
