const express = require("express");
const db = require("../db-sqlite");
const { requireAuth } = require("../middleware/auth");
const { ensureAttendanceSyncColumns } = require("../services/dreamclass-sync");

const router = express.Router();

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function levelFromCount(value, warn, critical) {
  if (value >= critical) return "Critical";
  if (value >= warn) return "Warning";
  return "Info";
}

function attendanceScoreFromRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(5, round((value / 100) * 5, 1)));
}

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    await ensureAttendanceSyncColumns();
    const requestedTermId = String(req.query.termId || "").trim();
    const settings = (await db.query("SELECT * FROM tv_settings LIMIT 1")).rows[0];

    let currentPhase = null;
    if (requestedTermId) {
      currentPhase = (
        await db.query("SELECT * FROM phases WHERE id = ? LIMIT 1", [requestedTermId])
      ).rows[0] || null;
    }

    if (!currentPhase && settings?.current_phase_id) {
      currentPhase = (
        await db.query("SELECT * FROM phases WHERE id = ? LIMIT 1", [settings.current_phase_id])
      ).rows[0] || null;
    }

    if (!currentPhase && settings?.current_term_id) {
      currentPhase = (
        await db.query(
          `SELECT *
           FROM phases
           WHERE term_id = ?
           ORDER BY
             CASE
               WHEN start_date IS NOT NULL
                AND end_date IS NOT NULL
                AND CURRENT_DATE BETWEEN start_date AND end_date THEN 0
               ELSE 1
             END,
             phase_order ASC,
             created_at ASC
           LIMIT 1`,
          [settings.current_term_id]
        )
      ).rows[0] || null;
    }

    if (!currentPhase) {
      currentPhase = (
        await db.query(
          `SELECT *
           FROM phases
           ORDER BY
             CASE
               WHEN start_date IS NOT NULL
                AND end_date IS NOT NULL
                AND CURRENT_DATE BETWEEN start_date AND end_date THEN 0
               ELSE 1
             END,
             phase_order ASC,
             created_at ASC
           LIMIT 1`
        )
      ).rows[0] || null;
    }

    if (!currentPhase) {
      const periods = (await db.query(
        `SELECT id, name, start_date, end_date
         FROM terms
         WHERE COALESCE(is_active, TRUE) = TRUE
         ORDER BY start_date ASC NULLS LAST, created_at ASC`
      )).rows;
      return res.json({
        kpis: {
          overallAverage: 0,
          studentsAtRisk: 0,
          highestTeam: { name: "N/A", avg: 0 },
        webdevSkillsAvg: 0,
          totalStudents: 0,
          metaSkillsAvg: 0
        },
        gradeDistribution: [
          { bucket: "4-5", count: 0 },
          { bucket: "3-3.9", count: 0 },
          { bucket: "2-2.9", count: 0 },
          { bucket: "1-1.9", count: 0 },
          { bucket: "<1", count: 0 }
        ],
        gradeTrend: [],
        teamPerformance: [],
        risks: {
          belowThreshold: 0,
          decliningPerformance: 0,
          coachingRequired: 0,
          metaSkillFlags: 0
        },
        coaching: {
          activeSessions: 0,
          completedThisPhase: 0,
          studentsWithoutPlan: 0
        },
        alerts: [],
        currentPeriod: periods[0] ? {
          id: periods[0].id,
          name: periods[0].name,
          startDate: periods[0].start_date,
          endDate: periods[0].end_date
        } : null,
        terms: [],
        lastUpdated: new Date().toISOString()
      });
    }

    const phaseId = currentPhase.id;
    const currentTermId = currentPhase.term_id || settings?.current_term_id || null;
    const currentPeriod = currentPhase.term_id
      ? (
          await db.query(
            `SELECT id, name, start_date, end_date
             FROM terms
             WHERE id = $1
             LIMIT 1`,
            [currentPhase.term_id]
          )
        ).rows[0] || null
      : null;

    const termRows = currentPhase.term_id
      ? (
          await db.query(
            `SELECT id, term_id, name, start_date, end_date, phase_order
             FROM phases
             WHERE term_id = $1
             ORDER BY phase_order ASC, created_at ASC`,
            [currentPhase.term_id]
          )
        ).rows
      : (
          await db.query(
            `SELECT id, term_id, name, start_date, end_date, phase_order
             FROM phases
             ORDER BY phase_order ASC, created_at ASC`
          )
        ).rows;

    const totalStudents = toNumber(
      (await db.query("SELECT COUNT(*) AS c FROM students WHERE status = 'active' ")).rows[0].c
    );

    const gradeScopeParams = [];
    let gradeScopeSql = "COALESCE(gb.is_visible, TRUE) = TRUE AND gv.value BETWEEN 0 AND 5";
    if (phaseId && currentTermId) {
      gradeScopeParams.push(phaseId, currentTermId);
      gradeScopeSql += ` AND (gv.phase_id = ? OR (gv.phase_id IS NULL AND gb.term_id = ?))`;
    } else if (phaseId) {
      gradeScopeParams.push(phaseId);
      gradeScopeSql += ` AND gv.phase_id = ?`;
    } else if (currentTermId) {
      gradeScopeParams.push(currentTermId);
      gradeScopeSql += ` AND gb.term_id = ?`;
    }

    const kpiAverages = (
      await db.query(
        `SELECT
           COALESCE(AVG(gv.value), 0) AS overall_avg,
           COALESCE(AVG(CASE WHEN gb.stream = 'meta' THEN gv.value END), 0) AS meta_avg,
          COALESCE(AVG(CASE WHEN gb.stream = 'webdev' THEN gv.value END), 0) AS webdev_avg
         FROM gradebook_values gv
         JOIN gradebooks gb ON gb.id = gv.gradebook_id
         WHERE ${gradeScopeSql}`,
        gradeScopeParams
      )
    ).rows[0] || {};

    const overallAverage = round(kpiAverages.overall_avg);
    const metaSkillsAvg = round(kpiAverages.meta_avg);
    const webdevSkillsAvg = round(kpiAverages.webdev_avg);

    const perStudentAverages = (
      await db.query(
        `SELECT
           s.id,
           s.team_id,
           COALESCE(AVG(CASE WHEN gb.id IS NOT NULL THEN gv.value END), 0) AS avg_score
         FROM students s
         LEFT JOIN gradebook_values gv ON gv.student_id = s.id
         LEFT JOIN gradebooks gb ON gb.id = gv.gradebook_id
                                AND ${gradeScopeSql}
         WHERE s.status = 'active'
         GROUP BY s.id, s.team_id`,
        gradeScopeParams
      )
    ).rows;

    const riskThreshold = 3;
    const studentsAtRisk = perStudentAverages.filter((s) => toNumber(s.avg_score) < riskThreshold).length;

    const distribution = {
      "4-5": 0,
      "3-3.9": 0,
      "2-2.9": 0,
      "1-1.9": 0,
      "<1": 0
    };

    for (const row of perStudentAverages) {
      const score = toNumber(row.avg_score);
      if (score >= 4) distribution["4-5"] += 1;
      else if (score >= 3) distribution["3-3.9"] += 1;
      else if (score >= 2) distribution["2-2.9"] += 1;
      else if (score >= 1) distribution["1-1.9"] += 1;
      else distribution["<1"] += 1;
    }

    const gradeDistribution = Object.entries(distribution).map(([bucket, count]) => ({ bucket, count }));

    const teamRows = (
      await db.query(
        `SELECT id, name
         FROM teams
         WHERE COALESCE(is_archived, FALSE) = FALSE
         ORDER BY name ASC`
      )
    ).rows;

    const teamScoreMap = new Map();
    for (const row of perStudentAverages) {
      const teamKey = row.team_id == null ? "__none__" : String(row.team_id);
      if (!teamScoreMap.has(teamKey)) teamScoreMap.set(teamKey, []);
      teamScoreMap.get(teamKey).push(toNumber(row.avg_score));
    }

    const teamPerformance = teamRows.map((team) => {
      const scores = teamScoreMap.get(String(team.id)) || [];
      const avg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
      return {
        teamName: team.name,
        average: round(avg)
      };
    });

    const sortedTeams = [...teamPerformance].sort((a, b) => b.average - a.average);
    const highestTeam = sortedTeams[0] || { teamName: "N/A", average: 0 };

    const trendParams = [];
    const trendWhere = currentPhase.term_id ? "WHERE p.term_id = ?" : "";
    if (currentPhase.term_id) trendParams.push(currentPhase.term_id);

    const trendRows = (
      await db.query(
        `SELECT
           p.id,
           p.name,
           p.phase_order,
           p.created_at,
           COALESCE(AVG(CASE WHEN gb.id IS NOT NULL THEN gv.value END), 0) AS average
         FROM phases p
         LEFT JOIN gradebook_values gv ON gv.phase_id = p.id
         LEFT JOIN gradebooks gb ON gb.id = gv.gradebook_id
                                AND COALESCE(gb.is_visible, TRUE) = TRUE
                                AND gv.value BETWEEN 0 AND 5
         ${trendWhere}
         GROUP BY p.id, p.name, p.phase_order, p.created_at
         ORDER BY p.phase_order ASC, p.created_at ASC`,
        trendParams
      )
    ).rows;

    const gradeTrend = trendRows.slice(-6).map((row) => ({
      period: row.name,
      average: round(row.average)
    }));

    let previousPhase = null;
    if (toNumber(currentPhase.phase_order) > 1) {
      if (currentPhase.term_id) {
        previousPhase = (
          await db.query(
            `SELECT * FROM phases
             WHERE term_id = ? AND phase_order < ?
             ORDER BY phase_order DESC, created_at DESC
             LIMIT 1`,
            [currentPhase.term_id, currentPhase.phase_order]
          )
        ).rows[0] || null;
      } else {
        previousPhase = (
          await db.query(
            `SELECT * FROM phases
             WHERE phase_order < ?
             ORDER BY phase_order DESC, created_at DESC
             LIMIT 1`,
            [currentPhase.phase_order]
          )
        ).rows[0] || null;
      }
    }

    let decliningPerformance = 0;
    if (previousPhase?.id) {
      const declineRows = (
        await db.query(
          `SELECT
             s.id,
             COALESCE(AVG(CASE WHEN gv.phase_id = ? THEN gv.value END), 0) AS current_avg,
             COALESCE(AVG(CASE WHEN gv.phase_id = ? THEN gv.value END), 0) AS previous_avg
           FROM students s
           LEFT JOIN gradebook_values gv ON gv.student_id = s.id
                                         AND gv.value BETWEEN 0 AND 5
           LEFT JOIN gradebooks gb ON gb.id = gv.gradebook_id
                                AND COALESCE(gb.is_visible, TRUE) = TRUE
           WHERE s.status = 'active'
           GROUP BY s.id`,
          [phaseId, previousPhase.id]
        )
      ).rows;

      decliningPerformance = declineRows.filter((row) => {
        const currentAvg = toNumber(row.current_avg);
        const previousAvg = toNumber(row.previous_avg);
        return previousAvg > 0 && (previousAvg - currentAvg) > 0.5;
      }).length;
    }

    const coachingRequired = perStudentAverages.filter((row) => toNumber(row.avg_score) < riskThreshold).length;

    const metaSkillFlags = toNumber(
      (
        await db.query(
          `SELECT COUNT(*) AS c
           FROM (
             SELECT
               s.id,
               COALESCE(AVG(CASE WHEN gb.id IS NOT NULL THEN gv.value END), 0) AS avg_meta
             FROM students s
             LEFT JOIN gradebook_values gv ON gv.student_id = s.id
             LEFT JOIN gradebooks gb ON gb.id = gv.gradebook_id
                                    AND ${gradeScopeSql}
                                    AND gb.stream = 'meta'
             WHERE s.status = 'active'
             GROUP BY s.id
           ) x
           WHERE x.avg_meta < ?`,
          [...gradeScopeParams, riskThreshold]
        )
      ).rows[0].c
    );

    const hasPhaseDates = Boolean(currentPhase.start_date && currentPhase.end_date);

    const activeSessions = toNumber(
      (
        await db.query(
          `SELECT COUNT(*) AS c
           FROM coaching_sessions
           WHERE session_date >= date('now', '-30 days')`
        )
      ).rows[0].c
    );

    const completedThisPhase = toNumber(
      hasPhaseDates
        ? (
            await db.query(
              `SELECT COUNT(*) AS c
               FROM coaching_sessions
               WHERE attended = 1
                 AND session_date >= ?
                 AND session_date <= ?`,
              [currentPhase.start_date, currentPhase.end_date]
            )
          ).rows[0].c
        : (
            await db.query(
              `SELECT COUNT(*) AS c
               FROM coaching_sessions
               WHERE attended = 1
                 AND session_date >= date('now', '-30 days')`
            )
          ).rows[0].c
    );

    const studentsWithoutPlan = toNumber(
      hasPhaseDates
        ? (
            await db.query(
              `SELECT COUNT(*) AS c
               FROM students s
               WHERE s.status = 'active'
                 AND NOT EXISTS (
                   SELECT 1
                   FROM coaching_sessions cs
                   WHERE cs.student_id = s.id
                     AND cs.session_date >= ?
                     AND cs.session_date <= ?
                 )`,
              [currentPhase.start_date, currentPhase.end_date]
            )
          ).rows[0].c
        : (
            await db.query(
              `SELECT COUNT(*) AS c
               FROM students s
               WHERE s.status = 'active'
                 AND NOT EXISTS (
                   SELECT 1
                   FROM coaching_sessions cs
                   WHERE cs.student_id = s.id
                 )`
            )
          ).rows[0].c
    );

    const risks = {
      belowThreshold: studentsAtRisk,
      decliningPerformance,
      coachingRequired,
      metaSkillFlags
    };

    const alerts = [
      {
        key: "Students Below 60",
        level: levelFromCount(risks.belowThreshold, 1, 10),
        message: `${risks.belowThreshold} students currently below ${riskThreshold}`
      },
      {
        key: "Declining Performance",
        level: levelFromCount(risks.decliningPerformance, 1, 8),
        message: `${risks.decliningPerformance} students dropped by more than 0.5`
      },
      {
        key: "Meta Skill Flags",
        level: levelFromCount(risks.metaSkillFlags, 1, 8),
        message: `${risks.metaSkillFlags} students under meta skills threshold`
      }
    ];

    const attendanceRangeStart = currentPhase.start_date || currentPeriod?.start_date || null;
    const attendanceRangeEnd = currentPhase.end_date || currentPeriod?.end_date || null;
    const attendanceParams = [];
    let attendanceJoin = `LEFT JOIN attendance a ON a.student_id = s.id AND a.external_source = 'dreamclass'`;
    if (attendanceRangeStart) {
      attendanceParams.push(attendanceRangeStart);
      attendanceJoin += ` AND a.attendance_date >= $${attendanceParams.length}`;
    }
    if (attendanceRangeEnd) {
      attendanceParams.push(attendanceRangeEnd);
      attendanceJoin += ` AND a.attendance_date <= $${attendanceParams.length}`;
    }

    const teamAttendance = (
      await db.query(
        `SELECT
           tm.id AS team_id,
           tm.name AS team_name,
           SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present_count,
           SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late_count,
           SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent_count
         FROM teams tm
         LEFT JOIN students s
           ON s.team_id = tm.id
          AND COALESCE(s.status, 'active') = 'active'
         ${attendanceJoin}
         WHERE COALESCE(tm.is_archived, FALSE) = FALSE
         GROUP BY tm.id, tm.name
         ORDER BY tm.name ASC`,
        attendanceParams
      )
    ).rows.map((row) => {
      const present = toNumber(row.present_count);
      const late = toNumber(row.late_count);
      const absent = toNumber(row.absent_count);
      const total = present + late + absent;
      const attendanceRate = total ? round((present / total) * 100, 1) : null;
      return {
        teamId: row.team_id,
        teamName: row.team_name,
        present,
        late,
        absent,
        total,
        attendanceRate,
        attendanceScore: attendanceScoreFromRate(attendanceRate)
      };
    });

    return res.json({
      kpis: {
        overallAverage,
        studentsAtRisk,
        highestTeam: { name: highestTeam.teamName, avg: highestTeam.average },
        webdevSkillsAvg,
        totalStudents,
        metaSkillsAvg: metaSkillsAvg
      },
      gradeDistribution,
      gradeTrend,
      teamPerformance,
      risks,
      coaching: {
        activeSessions,
        completedThisPhase,
        studentsWithoutPlan
      },
      teamAttendance,
      alerts,
      currentPeriod: currentPeriod ? {
        id: currentPeriod.id,
        name: currentPeriod.name,
        startDate: currentPeriod.start_date,
        endDate: currentPeriod.end_date
      } : null,
      terms: termRows.map((row) => ({
        id: row.id,
        periodId: row.term_id,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        order: row.phase_order,
        isCurrent: String(row.id) === String(currentPhase.id)
      })),
      currentPhase: {
        id: currentPhase.id,
        name: currentPhase.name
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;


