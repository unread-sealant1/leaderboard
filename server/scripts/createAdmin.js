require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("../db-sqlite");

async function run() {
  const email = process.argv[2];
  const password = process.argv[3];
  const fullName = process.argv[4] || "Admin";

  if (!email || !password) {
    console.log("Usage: npm run create-admin -- email password \"Full Name\"");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  await db.query(
    `INSERT INTO admins (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash=$2, full_name=$3`,
    [email.toLowerCase(), hash, fullName]
  );

  console.log("Admin created/updated:", email);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});