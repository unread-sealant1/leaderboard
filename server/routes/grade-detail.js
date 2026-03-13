const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { getGradeDetailData } = require("../services/grade-detail-data");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const data = await getGradeDetailData({
      phaseId: req.query.phaseId,
      termId: req.query.termId
    });
    res.json(data);
  } catch (error) {
    console.error("Grade detail fetch failed:", error);
    res.status(500).json({ message: "Failed to load grade detail data" });
  }
});

module.exports = router;
