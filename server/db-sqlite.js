if (process.env.DATABASE_URL) {
  module.exports = require("./db");
} else {
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "ihub_v2.db");
const db = new sqlite3.Database(dbPath);

// Create all tables
db.serialize(() => {
  // Admins table
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Terms table
  db.run(`
    CREATE TABLE IF NOT EXISTS terms (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      school_period_id TEXT,
      external_source TEXT,
      external_id TEXT,
      last_synced_at DATETIME,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Phases table
  db.run(`
    CREATE TABLE IF NOT EXISTS phases (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      phase_order INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Teams table
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      phase_id TEXT REFERENCES phases(id) ON DELETE CASCADE,
      is_archived BOOLEAN NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Students table
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      external_source TEXT,
      external_id TEXT,
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS team_memberships (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(team_id, student_id)
    )
  `);

  // Topics table
  db.run(`
    CREATE TABLE IF NOT EXISTS school_periods (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      external_source TEXT,
      external_id TEXT UNIQUE,
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      code TEXT,
      stream TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      external_source TEXT,
      external_id TEXT UNIQUE,
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS grade_mappings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      raw TEXT NOT NULL DEFAULT '{}',
      external_source TEXT,
      external_id TEXT UNIQUE,
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gradebooks (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      term_id TEXT REFERENCES terms(id) ON DELETE CASCADE,
      school_period_id TEXT REFERENCES school_periods(id) ON DELETE SET NULL,
      class_course_external_id TEXT,
      name TEXT NOT NULL,
      stream TEXT,
      grade_mapping_id TEXT REFERENCES grade_mappings(id) ON DELETE SET NULL,
      parent_gradebook_id TEXT REFERENCES gradebooks(id) ON DELETE SET NULL,
      external_source TEXT,
      external_id TEXT UNIQUE,
      grade_type INTEGER,
      position INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      is_visible BOOLEAN NOT NULL DEFAULT 1,
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gradebook_values (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      term_id TEXT REFERENCES terms(id) ON DELETE CASCADE,
      school_period_id TEXT REFERENCES school_periods(id) ON DELETE SET NULL,
      gradebook_id TEXT NOT NULL REFERENCES gradebooks(id) ON DELETE CASCADE,
      value REAL NOT NULL,
      external_source TEXT,
      external_id TEXT,
      raw TEXT NOT NULL DEFAULT '{}',
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, term_id, gradebook_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
      stream TEXT NOT NULL,
      title TEXT NOT NULL,
      week_number INTEGER,
      max_score INTEGER NOT NULL DEFAULT 100,
      external_source TEXT,
      external_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Grades table
  db.run(`
    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
      external_source TEXT,
      external_id TEXT,
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, topic_id)
    )
  `);

  // Attendance table
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL,
      school_period_id TEXT REFERENCES school_periods(id) ON DELETE SET NULL,
      external_source TEXT,
      external_id TEXT,
      raw TEXT NOT NULL DEFAULT '{}',
      last_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, attendance_date)
    )
  `);

  // Coaching sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS coaching_sessions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      attended BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // TV settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS tv_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      current_term_id TEXT REFERENCES terms(id) ON DELETE SET NULL,
      current_phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,
      current_stream TEXT NOT NULL DEFAULT 'meta',
      current_topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
      loop_seconds INTEGER NOT NULL DEFAULT 12,
      slide_seconds INTEGER NOT NULL DEFAULT 12,
      screen_mode TEXT NOT NULL DEFAULT 'playlist',
      enabled_screens TEXT NOT NULL DEFAULT '["topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]',
      screen_order TEXT NOT NULL DEFAULT '["welcome_screen","topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]',
      current_screen TEXT NOT NULL DEFAULT 'topic_team_dials',
      rotation_mode TEXT NOT NULL DEFAULT 'topic',
      rotation_order TEXT NOT NULL DEFAULT '["meta","webdev","coaching","alerts"]',
      enabled_streams TEXT NOT NULL DEFAULT '["webdev","meta","coaching","alerts"]',
      topic_scope TEXT NOT NULL DEFAULT 'phase',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate tv_settings columns (ignore "duplicate column" errors)
  [
    "ALTER TABLE teams ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0",
    "ALTER TABLE teams ADD COLUMN phase_id TEXT REFERENCES phases(id) ON DELETE CASCADE",
    "ALTER TABLE students ADD COLUMN external_source TEXT",
    "ALTER TABLE students ADD COLUMN external_id TEXT",
    "ALTER TABLE students ADD COLUMN last_synced_at DATETIME",
    "ALTER TABLE terms ADD COLUMN school_period_id TEXT",
    "ALTER TABLE terms ADD COLUMN external_source TEXT",
    "ALTER TABLE terms ADD COLUMN external_id TEXT",
    "ALTER TABLE terms ADD COLUMN last_synced_at DATETIME",
    "ALTER TABLE topics ADD COLUMN external_source TEXT",
    "ALTER TABLE topics ADD COLUMN external_id TEXT",
    "ALTER TABLE grades ADD COLUMN external_source TEXT",
    "ALTER TABLE grades ADD COLUMN external_id TEXT",
    "ALTER TABLE grades ADD COLUMN last_synced_at DATETIME",
    "ALTER TABLE attendance ADD COLUMN school_period_id TEXT REFERENCES school_periods(id) ON DELETE SET NULL",
    "ALTER TABLE attendance ADD COLUMN external_source TEXT",
    "ALTER TABLE attendance ADD COLUMN external_id TEXT",
    "ALTER TABLE attendance ADD COLUMN raw TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE attendance ADD COLUMN last_synced_at DATETIME",
    "ALTER TABLE tv_settings ADD COLUMN loop_seconds INTEGER DEFAULT 12",
    "ALTER TABLE tv_settings ADD COLUMN screen_mode TEXT DEFAULT 'playlist'",
    "ALTER TABLE tv_settings ADD COLUMN screen_order TEXT DEFAULT '[\"welcome_screen\",\"topic_team_dials\",\"meta_team_dials\",\"topic_student_bars\",\"coaching_team_trends\",\"alerts_summary\",\"comments_screen\",\"notifications_screen\",\"meta_skills_1\",\"meta_skills_2\"]'",
    "ALTER TABLE tv_settings ADD COLUMN current_screen TEXT DEFAULT 'topic_team_dials'",
    "ALTER TABLE tv_settings ADD COLUMN rotation_mode TEXT DEFAULT 'topic'",
    "ALTER TABLE tv_settings ADD COLUMN rotation_order TEXT DEFAULT '[\"meta\",\"webdev\",\"coaching\",\"alerts\"]'",
    "ALTER TABLE tv_settings ADD COLUMN enabled_streams TEXT DEFAULT '[\"webdev\",\"meta\",\"coaching\",\"alerts\"]'",
    "ALTER TABLE tv_settings ADD COLUMN topic_scope TEXT DEFAULT 'phase'",
    "ALTER TABLE tv_settings ADD COLUMN enabled_screens TEXT DEFAULT '[\"topic_team_dials\",\"meta_team_dials\",\"topic_student_bars\",\"coaching_team_trends\",\"alerts_summary\",\"comments_screen\",\"notifications_screen\",\"meta_skills_1\",\"meta_skills_2\"]'"
  ].forEach((sql) => db.run(sql, () => {}));

  db.run(
    `UPDATE tv_settings
     SET enabled_screens = '["topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'
     WHERE enabled_screens IN (
       '["welcome_screen","topic_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","meta_skills_1","meta_skills_2"]',
       '["welcome_screen","topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'
     )`
  );
  db.run(
    `UPDATE tv_settings
     SET screen_order = '["welcome_screen","topic_team_dials","meta_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","comments_screen","notifications_screen","meta_skills_1","meta_skills_2"]'
     WHERE screen_order = '["welcome_screen","topic_team_dials","topic_student_bars","coaching_team_trends","alerts_summary","meta_skills_1","meta_skills_2"]'`
  );
  db.run(
    `UPDATE tv_settings
     SET current_screen = 'topic_team_dials'
     WHERE current_screen = 'welcome_screen'
       AND enabled_screens NOT LIKE '%welcome_screen%'`
  );

  db.run("CREATE INDEX IF NOT EXISTS idx_students_external ON students(external_source, external_id)");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_phase_name_unique ON teams(phase_id, name)");
  db.run("CREATE INDEX IF NOT EXISTS idx_teams_phase_archived ON teams(phase_id, is_archived, name)");
  db.run("CREATE INDEX IF NOT EXISTS idx_team_memberships_student ON team_memberships(student_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_topics_external ON topics(external_source, external_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_grades_external ON grades(external_source, external_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attendance_external ON attendance(external_source, external_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attendance_school_period_date ON attendance(school_period_id, attendance_date)");

  // TV messages/alerts table
  db.run(`
    CREATE TABLE IF NOT EXISTS tv_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = {
  query: (text, params) => {
    return new Promise((resolve, reject) => {
      // Convert PostgreSQL syntax to SQLite
      let sqliteText = text
        .replace(/\$(\d+)/g, '?')
        .replace(/gen_random_uuid\(\)/g, 'lower(hex(randomblob(16)))')
        .replace(/now\(\)/g, 'CURRENT_TIMESTAMP')
        .replace(/INTERVAL '(\d+) days'/g, '$1 days')
        .replace(/CURRENT_DATE - INTERVAL/g, 'date(CURRENT_DATE, \'-\' ||')
        .replace(/CURRENT_DATE \+ INTERVAL/g, 'date(CURRENT_DATE, \'+\' ||')
        .replace(/::int/g, '')
        .replace(/COALESCE\(ROUND\(AVG\(([^)]+)\)\)::int, 0\)/g, 'COALESCE(ROUND(AVG($1)), 0)')
        .replace(/ON CONFLICT DO NOTHING/g, 'OR IGNORE');
      
      // Handle RETURNING clause for INSERT statements
      const returningMatch = sqliteText.match(/INSERT INTO (\w+) \([^)]+\) VALUES \([^)]+\) RETURNING (.+)/);
      
      if (returningMatch) {
        const tableName = returningMatch[1];
        const returningCols = returningMatch[2];
        const insertSql = sqliteText.replace(/ RETURNING .+$/, '');
        
        db.run(insertSql, params || [], function(err) {
          if (err) {
            reject(err);
          } else {
            // Get the inserted row
            const selectCols = returningCols === '*' ? '*' : returningCols;
            db.get(`SELECT ${selectCols} FROM ${tableName} WHERE rowid = ?`, [this.lastID], (err2, row) => {
              if (err2) reject(err2);
              else resolve({ rows: [row] });
            });
          }
        });
      } else if (text.toLowerCase().includes('select')) {
        db.all(sqliteText, params || [], (err, rows) => {
          if (err) reject(err);
          else resolve({ rows });
        });
      } else {
        db.run(sqliteText, params || [], function(err) {
          if (err) reject(err);
          else resolve({ rows: [], rowCount: this.changes });
        });
      }
    });
  },
};
}
