const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { pool, query } = require("../config/db");

const router = express.Router();

// router.use(verifyToken);

// Create join request
router.post("/projects/:id/request-join", async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if already member
    const memberCheck = await query(
      `SELECT id
       FROM project_members
       WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({
        message: "You are already a member of this project",
      });
    }

    // Check pending request
    const pendingCheck = await query(
      `SELECT id
       FROM join_requests
       WHERE project_id = $1
         AND user_id = $2
         AND status = 'pending'`,
      [projectId, userId]
    );

    if (pendingCheck.rows.length > 0) {
      return res.status(400).json({
        message: "You already have a pending request",
      });
    }

    const result = await query(
      `INSERT INTO join_requests (
          project_id,
          user_id,
          status
       )
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [projectId, userId]
    );

    return res.status(201).json({
      message: "Join request created",
      request: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// Get pending join requests (admin only)
router.get("/projects/:id/join-requests", verifyToken , async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;

  try {
    // Verify admin
    const adminCheck = await query(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2`,
      [projectId, userId]
    );

    if (
      adminCheck.rows.length === 0 ||
      adminCheck.rows[0].role !== "admin"
    ) {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const result = await query(
      `SELECT
          jr.id,
          jr.status,
          jr.requested_at,
          u.id AS user_id,
          u.name,
          u.email
       FROM join_requests jr
       JOIN users u
         ON u.id = jr.user_id
       WHERE jr.project_id = $1
         AND jr.status = 'pending'
       ORDER BY jr.requested_at ASC`,
      [projectId]
    );

    return res.json({
      requests: result.rows,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// Approve or reject join request (admin only)
router.patch("/projects/:id/join-requests/:requestId",verifyToken , async (req, res) => {
  const projectId = req.params.id;
  const requestId = req.params.requestId;
  const adminId = req.user.id;
  const { action } = req.body;

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({
      message: "Action must be approve or reject",
    });
  }

  const client = await pool.connect();

  try {
    // Verify admin
    const adminCheck = await client.query(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2`,
      [projectId, adminId]
    );

    if (
      adminCheck.rows.length === 0 ||
      adminCheck.rows[0].role !== "admin"
    ) {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    // Find request
    const requestResult = await client.query(
      `SELECT *
       FROM join_requests
       WHERE id = $1
         AND project_id = $2`,
      [requestId, projectId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        message: "Join request not found",
      });
    }

    const joinRequest = requestResult.rows[0];

    if (joinRequest.status !== "pending") {
      return res.status(400).json({
        message: "Request already processed",
      });
    }

    await client.query("BEGIN");

    const newStatus =
      action === "approve" ? "approved" : "rejected";

    await client.query(
      `UPDATE join_requests
       SET status = $1
       WHERE id = $2`,
      [newStatus, requestId]
    );

    // Add member if approved
    if (action === "approve") {
      await client.query(
        `INSERT INTO project_members (
            project_id,
            user_id,
            role
         )
         VALUES ($1, $2, 'member')`,
        [projectId, joinRequest.user_id]
      );
    }

    await client.query("COMMIT");

    return res.json({
      message: `Request ${newStatus}`,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// Get current user's join requests
router.get("/users/me/join-requests", verifyToken ,async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await query(
      `SELECT
          jr.id,
          jr.status,
          jr.requested_at,
          p.id AS project_id,
          p.name AS project_name,
          p.description
       FROM join_requests jr
       JOIN projects p
         ON p.id = jr.project_id
       WHERE jr.user_id = $1
       ORDER BY jr.requested_at DESC`,
      [userId]
    );

    return res.json({
      requests: result.rows,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;