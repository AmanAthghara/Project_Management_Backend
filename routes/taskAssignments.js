const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { pool, query } = require("../config/db");

const router = express.Router();

router.use(verifyToken);

const getTask = async (taskId) => {
  const result = await query(
    `SELECT id, project_id, title, description, status, priority, created_by, created_at
     FROM tasks
     WHERE id = $1`,
    [taskId]
  );
  return result.rows[0] || null;
};

const getProjectMembership = async (projectId, userId) => {
  const result = await query(
    `SELECT role
     FROM project_members
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return result.rows[0] || null;
};

const getAssignment = async (assignmentId) => {
  const result = await query(
    `SELECT id, task_id, assigned_to, assigned_by, status, assigned_at
     FROM task_assignments
     WHERE id = $1`,
    [assignmentId]
  );
  return result.rows[0] || null;
};

// POST /api/tasks/:taskId/assign
// Admin only
router.post("/tasks/:taskId/assign", verifyToken ,  async (req, res) => {
  const { taskId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  const client = await pool.connect();

  try {
    const task = await getTask(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const membership = await getProjectMembership(task.project_id, req.user.id);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const targetMembership = await getProjectMembership(task.project_id, userId);
    if (!targetMembership) {
      return res.status(400).json({ message: "User must be a project member" });
    }

    const alreadyAssigned = await query(
      `SELECT id
       FROM task_assignments
       WHERE task_id = $1 AND assigned_to = $2`,
      [taskId, userId]
    );

    if (alreadyAssigned.rows.length > 0) {
      return res.status(400).json({ message: "Task is already assigned to this user" });
    }

    const result = await query(
      `INSERT INTO task_assignments (task_id, assigned_to, assigned_by, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, task_id, assigned_to, assigned_by, status, assigned_at`,
      [taskId, userId, req.user.id]
    );

    return res.status(201).json({ assignment: result.rows[0] });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
});




// GET /api/tasks/:taskId/assignments
router.get("/tasks/:taskId/assignments",verifyToken ,  async (req, res) => {
  const { taskId } = req.params;

  try {
    const task = await getTask(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const membership = await getProjectMembership(task.project_id, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: "Project member access required" });
    }

    const result = await query(
      `SELECT
         ta.id,
         ta.task_id,
         ta.status,
         ta.assigned_at,
         assigned_to_user.id AS assigned_to_id,
         assigned_to_user.name AS assigned_to_name,
         assigned_to_user.email AS assigned_to_email,
         assigned_by_user.id AS assigned_by_id,
         assigned_by_user.name AS assigned_by_name,
         assigned_by_user.email AS assigned_by_email
       FROM task_assignments ta
       JOIN users assigned_to_user
         ON assigned_to_user.id = ta.assigned_to
       JOIN users assigned_by_user
         ON assigned_by_user.id = ta.assigned_by
       WHERE ta.task_id = $1
       ORDER BY ta.assigned_at DESC`,
      [taskId]
    );

    return res.json({ assignments: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});


// GET /api/projects/:id/assignment-requests
// Admin only
router.get("/projects/:id/assignment-requests",verifyToken ,  async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;

  try {
    const membership = await getProjectMembership(
      projectId,
      userId
    );

    if (!membership || membership.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const result = await query(
      `SELECT
          ta.id AS assignment_id,
          ta.status,
          ta.assigned_at,

          u.id AS member_id,
          u.name AS member_name,
          u.email AS member_email,

          t.id AS task_id,
          t.title AS task_title,
          t.description AS task_description,
          t.priority,
          t.status AS task_status

       FROM task_assignments ta

       JOIN tasks t
         ON t.id = ta.task_id

       JOIN users u
         ON u.id = ta.assigned_to

       WHERE t.project_id = $1
         AND ta.requested_by_member = TRUE
         AND ta.status = 'pending'

       ORDER BY ta.assigned_at DESC`,
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

// PATCH /api/tasks/:taskId/assignment-requests/:assignmentId/respond
// Admin only
router.patch(
  "/tasks/:taskId/assignment-requests/:assignmentId/respond",
  verifyToken , 
  async (req, res) => {
    const { taskId, assignmentId } = req.params;
    const { action } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        message: "Action must be approve or reject",
      });
    }

    const client = await pool.connect();

    try {
      const task = await getTask(taskId);

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
        });
      }

      const membership = await getProjectMembership(
        task.project_id,
        req.user.id
      );

      if (!membership || membership.role !== "admin") {
        return res.status(403).json({
          message: "Admin access required",
        });
      }

      const assignment = await getAssignment(assignmentId);

      if (
        !assignment ||
        String(assignment.task_id) !== String(taskId)
      ) {
        return res.status(404).json({
          message: "Assignment request not found",
        });
      }

      // Ensure it's member-requested
      const requestCheck = await client.query(
        `SELECT requested_by_member, status
         FROM task_assignments
         WHERE id = $1`,
        [assignmentId]
      );

      if (
        requestCheck.rows.length === 0 ||
        !requestCheck.rows[0].requested_by_member
      ) {
        return res.status(400).json({
          message: "Not a member assignment request",
        });
      }

      if (requestCheck.rows[0].status !== "pending") {
        return res.status(400).json({
          message: "Request already processed",
        });
      }

      await client.query("BEGIN");

      const newStatus =
        action === "approve"
          ? "accepted"
          : "rejected";

      const updated = await client.query(
        `UPDATE task_assignments
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        [newStatus, assignmentId]
      );

      if (action === "approve") {
        await client.query(
          `UPDATE tasks
           SET status = 'in_progress'
           WHERE id = $1`,
          [taskId]
        );
      }

      await client.query("COMMIT");

      return res.json({
        message: `Assignment request ${newStatus}`,
        assignment: updated.rows[0],
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
  }
);
// POST /api/tasks/:taskId/request-assignment
// Member requests assignment for themselves
router.post("/tasks/:taskId/request-assignment", verifyToken , async (req, res) => {
  const { taskId } = req.params;
  const userId = req.user.id;

  try {
    const task = await getTask(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const membership = await getProjectMembership(
      task.project_id,
      userId
    );

    if (!membership) {
      return res.status(403).json({
        message: "Project member access required",
      });
    }

    // Prevent admin from requesting
    if (membership.role === "admin") {
      return res.status(400).json({
        message: "Admins cannot request assignments",
      });
    }

    // Already assigned/requested?
    const existing = await query(
      `SELECT id, status
       FROM task_assignments
       WHERE task_id = $1
         AND assigned_to = $2`,
      [taskId, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: "You already have an assignment/request for this task",
      });
    }

    const result = await query(
      `INSERT INTO task_assignments (
          task_id,
          assigned_to,
          assigned_by,
          status,
          requested_by_member
       )
       VALUES ($1, $2, $3, 'pending', TRUE)
       RETURNING id, task_id, assigned_to, assigned_by, status, requested_by_member, assigned_at`,
      [
        taskId,
        userId,
        userId, // requester
      ]
    );

    return res.status(201).json({
      message: "Assignment request submitted",
      assignmentRequest: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});



// PATCH /api/tasks/:taskId/assignments/:assignmentId/respond
// Member only, and only the assigned user
router.patch(
  "/tasks/:taskId/assignments/:assignmentId/respond",
  verifyToken , 
  async (req, res) => {
    const { taskId, assignmentId } = req.params;
    const { action } = req.body;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be accept or reject" });
    }

    const client = await pool.connect();

    try {
      const task = await getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const membership = await getProjectMembership(task.project_id, req.user.id);
      if (!membership) {
        return res.status(403).json({ message: "Project member access required" });
      }

      const assignment = await getAssignment(assignmentId);
      if (!assignment || String(assignment.task_id) !== String(taskId)) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      if (String(assignment.assigned_to) !== String(req.user.id)) {
        return res.status(403).json({ message: "You can only respond to your own assignment" });
      }

      if (assignment.status !== "pending") {
        return res.status(400).json({ message: "Assignment already processed" });
      }

      await client.query("BEGIN");

      const newStatus = action === "accept" ? "accepted" : "rejected";

      const updatedAssignment = await client.query(
        `UPDATE task_assignments
         SET status = $1
         WHERE id = $2
         RETURNING id, task_id, assigned_to, assigned_by, status, assigned_at`,
        [newStatus, assignmentId]
      );

      if (action === "accept") {
        await client.query(
          `UPDATE tasks
           SET status = 'in_progress'
           WHERE id = $1`,
          [taskId]
        );
      }

      await client.query("COMMIT");

      return res.json({
        message: `Assignment ${newStatus}`,
        assignment: updatedAssignment.rows[0],
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
  }
);

// GET /api/users/me/assignments
router.get("/users/me/assignments", verifyToken ,  async (req, res) => {
  try {
    const result = await query(
      `SELECT
         ta.id AS assignment_id,
         ta.status AS assignment_status,
         ta.assigned_at,
         t.id AS task_id,
         t.title AS task_title,
         t.description AS task_description,
         t.status AS task_status,
         t.priority AS task_priority,
         t.created_at AS task_created_at,
         p.id AS project_id,
         p.name AS project_name,
         p.description AS project_description
       FROM task_assignments ta
       JOIN tasks t
         ON t.id = ta.task_id
       JOIN projects p
         ON p.id = t.project_id
       WHERE ta.assigned_to = $1
       ORDER BY ta.assigned_at DESC`,
      [req.user.id]
    );

    return res.json({ assignments: result.rows });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;