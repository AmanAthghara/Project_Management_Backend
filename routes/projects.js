const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { pool, query } = require("../config/db");

const router = express.Router();
const {
  requireProjectMember,
  requireProjectAdmin,
} = require("../middleware/authorize");



// router.use(verifyToken);

// Create a project
router.post("/", verifyToken , async (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Project name is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const projectResult = await client.query(
      `INSERT INTO projects (name, description, admin_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, admin_id, created_at`,
      [name.trim(), description || null, req.user.id]
    );

    const project = projectResult.rows[0];

    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [project.id, req.user.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({ project });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    client.release();
  }
});

// Get all projects the user belongs to
router.get("/", verifyToken , async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.admin_id,
         p.created_at,
         pm.role
       FROM projects p
       INNER JOIN project_members pm
         ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return res.json({ projects: result.rows });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});



// Discover projects not joined yet
router.get("/discover", verifyToken , async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.admin_id,
         p.created_at
       FROM projects p
       WHERE NOT EXISTS (
         SELECT 1
         FROM project_members pm
         WHERE pm.project_id = p.id
           AND pm.user_id = $1
       )
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return res.json({ projects: result.rows });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});




// Get project details + members if user is a member
router.get("/:id", verifyToken, requireProjectMember, async (req, res) => {
  // project detail
  const projectId = req.params.id;

  try {
    const membershipResult = await query(
      `SELECT id, role
       FROM project_members
       WHERE project_id = $1 AND user_id = $2`,
      [projectId, req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized to view this project" });
    }

    const projectResult = await query(
      `SELECT id, name, description, admin_id, created_at
       FROM projects
       WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: "Project not found" });
    }

    const membersResult = await query(
      `SELECT 
         u.id,
         u.name,
         u.email,
         pm.role,
         pm.joined_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.joined_at ASC`,
      [projectId]
    );

    return res.json({
      project: projectResult.rows[0],
      members: membersResult.rows,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});



module.exports = router;