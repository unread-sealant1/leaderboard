const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function replaceQuestionPlaceholders(sql) {
  if (!sql.includes("?")) return sql;
  // If query already uses PostgreSQL placeholders, leave it as-is.
  if (/\$\d+/.test(sql)) return sql;

  let i = 0;
  return sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
}

function replaceSqliteDateNow(sql) {
  let out = sql;

  // date('now', '-30 days') / date('now', '+7 days')
  out = out.replace(
    /date\(\s*'now'\s*,\s*'([+-]?\d+)\s+days'\s*\)/gi,
    (_, days) => {
      const n = Number(days);
      if (!Number.isFinite(n)) return "CURRENT_DATE";
      if (n === 0) return "CURRENT_DATE";
      const sign = n > 0 ? "+" : "-";
      return `(CURRENT_DATE ${sign} INTERVAL '${Math.abs(n)} days')::date`;
    }
  );

  // date('now', $1) where param is string like '-30 days'
  out = out.replace(
    /date\(\s*'now'\s*,\s*(\$\d+)\s*\)/gi,
    (_, p) => `((CURRENT_DATE + (${p})::interval))::date`
  );

  return out;
}

function replaceSqliteStrftime(sql) {
  return sql.replace(
    /strftime\(\s*'%Y-%W'\s*,\s*([^)]+?)\s*\)/gi,
    (_, expr) => `to_char((${expr})::date, 'IYYY-IW')`
  );
}

function replaceBooleanComparisons(sql) {
  let out = sql;
  out = out.replace(
    /COALESCE\(\s*([^)]*?(?:is_archived|is_active|attended))\s*,\s*0\s*\)\s*=\s*0\b/gi,
    "COALESCE($1, FALSE) = FALSE"
  );
  out = out.replace(
    /COALESCE\(\s*([^)]*?(?:is_archived|is_active|attended))\s*,\s*0\s*\)\s*=\s*1\b/gi,
    "COALESCE($1, FALSE) = TRUE"
  );

  const booleanCols = ["attended", "is_active", "is_archived"];
  for (const col of booleanCols) {
    const colPattern = `((?:\\b\\w+\\.)?${col})`;
    out = out.replace(new RegExp(`${colPattern}\\s*=\\s*1\\b`, "gi"), "$1 = TRUE");
    out = out.replace(new RegExp(`${colPattern}\\s*=\\s*0\\b`, "gi"), "$1 = FALSE");
    out = out.replace(new RegExp(`${colPattern}\\s*!=\\s*1\\b`, "gi"), "$1 != TRUE");
    out = out.replace(new RegExp(`${colPattern}\\s*!=\\s*0\\b`, "gi"), "$1 != FALSE");
  }

  // COALESCE(bool_col, 0) -> COALESCE(bool_col, FALSE)
  out = out.replace(
    /COALESCE\(\s*([^)]*?(?:is_archived|is_active|attended))\s*,\s*0\s*\)/gi,
    "COALESCE($1, FALSE)"
  );

  return out;
}

function replaceInsertOrIgnore(sql) {
  if (!/INSERT\s+OR\s+IGNORE/i.test(sql)) return sql;
  return sql.replace(/INSERT\s+OR\s+IGNORE/i, "INSERT").replace(/\s*;?\s*$/i, " ON CONFLICT DO NOTHING");
}

function normalizeSql(sqlText) {
  let sql = String(sqlText || "");
  sql = replaceQuestionPlaceholders(sql);
  sql = replaceInsertOrIgnore(sql);
  sql = replaceSqliteDateNow(sql);
  sql = replaceSqliteStrftime(sql);
  sql = replaceBooleanComparisons(sql);
  return sql;
}

module.exports = {
  query: (text, params) => {
    const normalized = normalizeSql(text);
    return pool.query(normalized, params);
  },
  _normalizeSql: normalizeSql,
};
