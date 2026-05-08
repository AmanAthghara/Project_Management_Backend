const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../server");
const { query, pool } = require("../config/db");

const makeToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

describe("Authorization middleware integration", () => {
  let admin;
  let member;
  let outsider;
  let project;
  let task;

  beforeAll(async () => {
    await query("DELETE FROM task_assignments");
    await query("DELETE FROM tasks");
    await query("DELETE FROM join_requests");
    await query("DELETE FROM project_members");
    await query("DELETE FROM projects");
    await query("DELETE FROM users");

    admin = (
      await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        ["Admin User", "admin@test.com", "x"]
      )
    ).rows[0];

    member = (
      await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        ["Member User", "member@test.com", "x"]
      )
    ).rows[0];

    outsider = (
      await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        ["Outsider User", "outsider@test.com", "x"]
      )
    ).rows[0];

    project = (
      await query(
        `INSERT INTO projects (name, description, admin_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ["Test Project", "Auth test project", admin.id]
      )
    ).rows[0];

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [project.id, admin.id]
    );

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [project.id, member.id]
    );

    task = (
      await query(
        `INSERT INTO tasks (project_id, title, description, status, priority, created_by)
         VALUES ($1, $2, $3, 'todo', 'medium', $4)
         RETURNING id`,
        [project.id, "Test Task", "Task for auth tests", admin.id]
      )
    ).rows[0];
  });

  afterAll(async () => {
    await pool.end();
  });

  test("non-members cannot access project endpoints", async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${makeToken(outsider)}`);

    expect(res.status).toBe(403);
  });

  test("members cannot use admin-only endpoints", async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set("Authorization", `Bearer ${makeToken(member)}`)
      .send({
        title: "New task",
        description: "Should fail",
        priority: "high",
      });

    expect(res.status).toBe(403);
  });
});