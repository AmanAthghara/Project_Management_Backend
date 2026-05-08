const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { query } = require("../config/db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return null;
};

router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const validationResponse = handleValidationErrors(req, res);
    if (validationResponse) return validationResponse;

    const { name, email, password } = req.body;

    try {
      const existingUser = await query(
        "SELECT id FROM users WHERE email = $1",
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ message: "Email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at`,
        [name, email, passwordHash]
      );

      const user = result.rows[0];
      const token = generateToken(user);

      return res.status(201).json({
        token,
        user,
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const validationResponse = handleValidationErrors(req, res);
    if (validationResponse) return validationResponse;

    const { email, password } = req.body;

    try {
      const result = await query(
        `SELECT id, name, email, password_hash, created_at
         FROM users
         WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      };

      const token = generateToken(safeUser);

      return res.json({
        token,
        user: safeUser,
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

router.post("/logout", (req, res) => {
  return res.json({ message: "logged out" });
});

router.get("/me", verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;