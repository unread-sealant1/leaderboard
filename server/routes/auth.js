const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db-sqlite");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  const result = await db.query(
    "SELECT id, email, password_hash, role, full_name, is_active FROM admins WHERE email=$1",
    [email.toLowerCase()]
  );

  const admin = result.rows[0];
  if (!admin || !admin.is_active) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
  );

  return res.json({
    token,
    admin: { id: admin.id, email: admin.email, fullName: admin.full_name, role: admin.role },
  });
});

module.exports = router;