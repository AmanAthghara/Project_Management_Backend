const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { query } = require("../config/db");

const router = express.Router();

// router.use(verifyToken);

router.get("/users/me/notifications", async (req, res) => {
  const userId = req.user.id;

  try {
    const adminProjectsResult = await query(
      `SELECT project_id
       FROM project_members
       WHERE user_id = $1 AND role = 'admin'`,
      [userId]
    );

    const adminProjectIds = adminProjectsResult.rows.map((r) => r.project_id);

    const myJoinRequestsStatusResult = await query(
      `SELECT
         jr.id AS request_id,
         jr.project_id,
         p.name AS project_name,
         p.description AS project_description,
         jr.status,
         jr.requested_at
       FROM join_requests jr
       JOIN projects p ON p.id = jr.project_id
       WHERE jr.user_id = $1
       ORDER BY jr.requested_at DESC`,
      [userId]
    );

    const pendingAssignmentsResult = await query(
      `SELECT
         ta.id AS assignment_id,
         ta.task_id,
         t.title AS task_title,
         t.priority AS task_priority,
         t.status AS task_status,
         t.project_id,
         p.name AS project_name,
         ta.assigned_by AS assigned_by_id,
         u.name AS assigned_by_name,
         u.email AS assigned_by_email,
         ta.assigned_at
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN projects p ON p.id = t.project_id
       JOIN users u ON u.id = ta.assigned_by
       WHERE ta.assigned_to = $1
         AND ta.status = 'pending'
       ORDER BY ta.assigned_at DESC`,
      [userId]
    );

    let pendingJoinRequests = [];
    let pendingAssignmentRequests = [];

    if (adminProjectIds.length > 0) {
      const pendingJoinRequestsResult = await query(
        `SELECT
           jr.id AS request_id,
           jr.project_id,
           p.name AS project_name,
           p.description AS project_description,
           jr.user_id AS requester_id,
           u.name AS requester_name,
           u.email AS requester_email,
           jr.requested_at
         FROM join_requests jr
         JOIN projects p ON p.id = jr.project_id
         JOIN users u ON u.id = jr.user_id
         WHERE jr.status = 'pending'
           AND jr.project_id = ANY($1::bigint[])
         ORDER BY jr.requested_at DESC`,
        [adminProjectIds]
      );

      pendingJoinRequests = pendingJoinRequestsResult.rows;

      const pendingAssignmentRequestsResult = await query(
        `SELECT
           ta.id AS assignment_id,
           ta.task_id,
           t.title AS task_title,
           t.priority AS task_priority,
           t.project_id,
           p.name AS project_name,
           ta.assigned_to AS member_id,
           u.name AS member_name,
           u.email AS member_email,
           ta.assigned_at
         FROM task_assignments ta
         JOIN tasks t ON t.id = ta.task_id
         JOIN projects p ON p.id = t.project_id
         JOIN users u ON u.id = ta.assigned_to
         WHERE ta.requested_by_member = TRUE
           AND ta.status = 'pending'
           AND t.project_id = ANY($1::bigint[])
         ORDER BY ta.assigned_at DESC`,
        [adminProjectIds]
      );

      pendingAssignmentRequests = pendingAssignmentRequestsResult.rows;
    }

    return res.json({
      pendingJoinRequests,
      myJoinRequestsStatus: myJoinRequestsStatusResult.rows,
      pendingAssignments: pendingAssignmentsResult.rows,
      pendingAssignmentRequests,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;