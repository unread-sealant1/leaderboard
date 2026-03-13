require("dotenv").config();
const db = require("../db-sqlite");

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function emailify(first, last, i) {
  return `${first}.${last}.${i}@demo.ihub`.toLowerCase();
}

async function run() {
  console.log("Seeding demo data...");

  // wipe core tables (leave admins)
  await db.query("DELETE FROM coaching_sessions");
  await db.query("DELETE FROM attendance");
  await db.query("DELETE FROM grades");
  await db.query("DELETE FROM topics");
  await db.query("DELETE FROM students");
  await db.query("DELETE FROM teams");
  await db.query("DELETE FROM phases");
  await db.query("DELETE FROM terms");
  await db.query("DELETE FROM tv_settings");

  // Teams - insert and then select
  const teamNames = ["Team 1", "Team 2", "Team 3", "Team 4"];
  for (const name of teamNames) {
    await db.query("INSERT INTO teams (name) VALUES (?)", [name]);
  }
  const teams = (await db.query("SELECT * FROM teams ORDER BY name")).rows;

  // Terms
  await db.query("INSERT INTO terms (name, start_date, end_date) VALUES (?,?,?)", ["Term 1", "2026-01-20", "2026-04-20"]);
  await db.query("INSERT INTO terms (name, start_date, end_date) VALUES (?,?,?)", ["Term 2", "2026-05-01", "2026-08-20"]);
  const terms = (await db.query("SELECT * FROM terms ORDER BY name")).rows;
  const term1 = terms.find(t => t.name === "Term 1");

  // Phases
  await db.query("INSERT INTO phases (term_id, name, start_date, end_date, phase_order) VALUES (?,?,?,?,?)", [term1.id, "Phase 1", "2026-01-20", "2026-03-05", 1]);
  await db.query("INSERT INTO phases (term_id, name, start_date, end_date, phase_order) VALUES (?,?,?,?,?)", [term1.id, "Phase 2", "2026-03-06", "2026-04-20", 2]);
  const phases = (await db.query("SELECT * FROM phases WHERE term_id = ?", [term1.id])).rows;
  const phase1 = phases.find(p => p.name === "Phase 1");

  // Topics
  const metaTopics = ["Collaboration", "Communication", "Time Management", "Critical Thinking"];
  const digitalTopics = ["HTML & Semantics", "CSS Layout", "JavaScript Basics", "React Fundamentals"];

  for (let i = 0; i < metaTopics.length; i++) {
    await db.query("INSERT INTO topics (phase_id, stream, title, week_number, max_score) VALUES (?,?,?,?,?)", [phase1.id, "meta", metaTopics[i], i + 1, 100]);
  }

  for (let i = 0; i < digitalTopics.length; i++) {
    await db.query("INSERT INTO topics (phase_id, stream, title, week_number, max_score) VALUES (?,?,?,?,?)", [phase1.id, "digital", digitalTopics[i], i + 1, 100]);
  }

  await db.query("INSERT INTO topics (phase_id, stream, title, week_number, max_score) VALUES (?,?,?,?,?)", [phase1.id, "coaching", "Coaching Sessions", 1, 100]);

  const topics = (await db.query("SELECT * FROM topics WHERE phase_id = ?", [phase1.id])).rows;

  // 40 students
  const firstNames = ["Ava","Liam","Noah","Mia","Ethan","Zoe","Kai","Aria","Jayden","Lerato","Thabo","Naledi","Ayanda","Sipho","Amahle"];
  const lastNames = ["Mokoena","Dlamini","Naidoo","Pillay","Nkosi","Smith","Johnson","VanWyk","Mahlangu","Masango","Ndlovu","Khumalo","Botha"];

  for (let i = 1; i <= 40; i++) {
    const first = pick(firstNames);
    const last = pick(lastNames);
    const team = teams[(i - 1) % teams.length];
    await db.query("INSERT INTO students (first_name, last_name, email, team_id) VALUES (?,?,?,?)", [first, last, emailify(first, last, i), team.id]);
  }

  const students = (await db.query("SELECT * FROM students")).rows;

  // Grades: each student has a score for each meta + digital topic in phase1
  const gradeTopics = topics.filter(t => t.stream === "meta" || t.stream === "digital");
  for (const s of students) {
    for (const t of gradeTopics) {
      const base = t.stream === "digital" ? rand(55, 92) : rand(60, 95);
      await db.query("INSERT INTO grades (student_id, topic_id, score) VALUES (?,?,?)", [s.id, t.id, base]);
    }
  }

  // Attendance: last 14 days
  const today = new Date("2026-02-03");
  for (let d = 13; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    for (const s of students) {
      const roll = Math.random();
      const status = roll < 0.86 ? "present" : roll < 0.94 ? "late" : "absent";
      await db.query("INSERT OR IGNORE INTO attendance (student_id, attendance_date, status) VALUES (?,?,?)", [s.id, dateStr, status]);
    }
  }

  // Coaching sessions: weekly totals for last 6 weeks
  for (let w = 0; w < 6; w++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (w * 7));
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    for (const s of students) {
      if (Math.random() < 0.6) {
        const attended = Math.random() < 0.88;
        await db.query("INSERT INTO coaching_sessions (student_id, session_date, attended) VALUES (?,?,?)", [s.id, dateStr, attended]);
      }
    }
  }

  // TV settings (default)
  const metaTopic = topics.find(t => t.stream === "meta");
  await db.query(
    "INSERT INTO tv_settings (current_term_id, current_phase_id, current_stream, current_topic_id, loop_seconds, slide_seconds, screen_mode, enabled_screens, screen_order, current_screen, rotation_mode, rotation_order, enabled_streams, topic_scope) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      term1.id,
      phase1.id,
      "meta",
      metaTopic.id,
      12,
      12,
      "playlist",
      JSON.stringify(["topic_team_dials", "topic_student_bars", "coaching_team_trends", "alerts_summary", "meta_skills_1", "meta_skills_2"]),
      JSON.stringify(["welcome_screen", "topic_team_dials", "topic_student_bars", "coaching_team_trends", "alerts_summary", "meta_skills_1", "meta_skills_2"]),
      "topic_team_dials",
      "topic",
      JSON.stringify(["meta", "digital", "coaching", "alerts"]),
      JSON.stringify(["digital", "meta", "coaching", "alerts"]),
      "phase"
    ]
  );

  console.log("Demo seed complete.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
