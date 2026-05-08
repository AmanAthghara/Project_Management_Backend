const { query } = require("../config/db");

const loadProjectRole = async (projectId, userId) => {
  const result = await query(
    `SELECT role
     FROM project_members
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );

  return result.rows[0] || null;
};

const requireProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.id;

    if (!projectId) {
      return res.status(400).json({ message: "Project id is required" });
    }

    const membership = await loadProjectRole(projectId, req.user.id);

    if (!membership) {
      return res.status(403).json({ message: "Project member access required" });
    }

    req.projectRole = membership.role;
    req.projectId = projectId;
    return next();
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const requireProjectAdmin = async (req, res, next) => {
  try {
    const projectId = req.params.id;

    if (!projectId) {
      return res.status(400).json({ message: "Project id is required" });
    }

    const membership = await loadProjectRole(projectId, req.user.id);

    if (!membership) {
      return res.status(403).json({ message: "Project member access required" });
    }

    if (membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.projectRole = membership.role;
    req.projectId = projectId;
    return next();
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const requireTaskAccess = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ message: "Task id is required" });
    }

    const taskResult = await query(
      `SELECT id, project_id
       FROM tasks
       WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    const { project_id } = taskResult.rows[0];
    const membership = await loadProjectRole(project_id, req.user.id);

    if (!membership) {
      return res.status(403).json({ message: "Project member access required" });
    }

    req.projectId = project_id;
    req.projectRole = membership.role;
    return next();
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  requireProjectMember,
  requireProjectAdmin,
  requireTaskAccess,
};