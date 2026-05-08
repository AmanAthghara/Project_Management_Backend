const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { pool, query } = require("../config/db");

const router = express.Router();

// router.use(verifyToken);

const getProjectMembership = async (projectId, userId) => {
  const result = await query(
    `SELECT role
     FROM project_members
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return result.rows[0] || null;
};

const getProjectExists = async (projectId) => {
  const result = await query(
    `SELECT id, name
     FROM projects
     WHERE id = $1`,
    [projectId]
  );
  return result.rows[0] || null;
};

const getTaskById = async (taskId) => {
  const result = await query(
    `SELECT id, project_id, title, description, status, priority, created_by, created_at
     FROM tasks
     WHERE id = $1`,
    [taskId]
  );
  return result.rows[0] || null;
};

const enrichTaskRows = async (tasks) => {
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);

  const assignmentsResult = await query(
    `SELECT DISTINCT ON (ta.task_id)
        ta.task_id,
        ta.id AS assignment_id,
        ta.status AS assignment_status,
        ta.assigned_at,
        u.id AS assignee_id,
        u.name AS assignee_name,
        u.email AS assignee_email
     FROM task_assignments ta
     JOIN users u ON u.id = ta.assigned_to
     WHERE ta.task_id = ANY($1::bigint[])
     ORDER BY ta.task_id, ta.assigned_at DESC, ta.id DESC`,
    [taskIds]
  );

  const assignmentMap = new Map(
    assignmentsResult.rows.map((row) => [String(row.task_id), row])
  );

  return tasks.map((task) => ({
    ...task,
    assignment: assignmentMap.get(String(task.id)) || null,
  }));
};

// POST /api/projects/:id/tasks
// Admin only
router.post("/projects/:id/tasks", verifyToken, async (req, res) => {
  // console.log(req.body);
  // console.log(req.user);
  const projectId = req.params.id;
  const userId = req.user.id;
  const { title, description } = req.body;

  // Normalize priority before validation
  const priority = req.body.priority?.trim().toLowerCase() || null;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: "Title is required" });
  }

  if (priority && !["low", "medium", "high"].includes(priority)) {
    return res.status(400).json({ message: "Invalid priority" });
  }

  try {
    const membership = await getProjectMembership(projectId, userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const project = await getProjectExists(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const result = await query(
  `INSERT INTO tasks (project_id, title, description, status, priority, created_by)
   VALUES ($1, $2, $3, 'todo', COALESCE($4::task_priority, 'medium'), $5)
   RETURNING id, project_id, title, description, status, priority, created_by, created_at`,
  [projectId, title.trim(), description || null, priority, userId]
);

    return res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});
// GET /api/projects/:id/tasks
// Members only
router.get("/projects/:id/tasks", verifyToken ,  async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;

  try {
    const membership = await getProjectMembership(projectId, userId);
    if (!membership) {
      return res.status(403).json({ message: "Project member access required" });
    }

    const result = await query(
      `SELECT
         t.id,
         t.project_id,
         t.title,
         t.description,
         t.status,
         t.priority,
         t.created_at,
         t.created_by,
         u.name AS created_by_name,
         u.email AS created_by_email
       FROM tasks t
       JOIN users u ON u.id = t.created_by
       WHERE t.project_id = $1
       ORDER BY t.created_at DESC`,
      [projectId]
    );

    const tasks = await enrichTaskRows(result.rows);

    return res.json({ tasks });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// PATCH /api/tasks/:taskId
// Admin only
router.patch("/tasks/:taskId", verifyToken ,  async (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.user.id;
  const { title, description, priority, status } = req.body;

  if (
    priority &&
    !["low", "medium", "high"].includes(priority)
  ) {
    return res.status(400).json({ message: "Invalid priority" });
  }

  if (
    status &&
    !["todo", "in_progress", "done"].includes(status)
  ) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const client = await pool.connect();

  try {
    const task = await getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const membership = await client.query(
      `SELECT role
       FROM project_members
       WHERE project_id = $1 AND user_id = $2`,
      [task.project_id, userId]
    );

    if (
      membership.rows.length === 0 ||
      membership.rows[0].role !== "admin"
    ) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const updated = await client.query(
      `UPDATE tasks
       SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         priority = COALESCE($3, priority),
         status = COALESCE($4, status)
       WHERE id = $5
       RETURNING id, project_id, title, description, status, priority, created_by, created_at`,
      [
        title ? title.trim() : null,
        description !== undefined ? description : null,
        priority || null,
        status || null,
        taskId,
      ]
    );

    return res.json({ task: updated.rows[0] });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// DELETE /api/tasks/:taskId
// Admin only
router.delete("/tasks/:taskId", verifyToken ,  async (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    const task = await getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const membership = await client.query(
      `SELECT role
       FROM project_members
       WHERE project_id = $1 AND user_id = $2`,
      [task.project_id, userId]
    );

    if (
      membership.rows.length === 0 ||
      membership.rows[0].role !== "admin"
    ) {
      return res.status(403).json({ message: "Admin access required" });
    }

    await client.query("BEGIN");

    // Assignments will be removed automatically because task_assignments.task_id
    // has ON DELETE CASCADE, but deleting tasks here is enough.
    await client.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

    await client.query("COMMIT");

    return res.json({ message: "Task deleted" });
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

module.exports = router;