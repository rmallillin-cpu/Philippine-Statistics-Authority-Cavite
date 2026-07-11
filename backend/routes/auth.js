const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sheetsService = require('../services/sheetsService');
require('dotenv').config();

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { firstName, middleName, lastName, position, department, username, password } = req.body;
    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({ error: 'First name, last name, username and password are required' });
    }

    const users = await sheetsService.getAll('Users');
    if (users.some((u) => u.Username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // A default Admin account is auto-created on first server startup (see sheetsService.ensureDefaultAdmin),
    // so every self-registered account is a regular User. Promote via Personnel > "Make admin".

    const newUser = await sheetsService.insert('Users', {
      FirstName: firstName,
      MiddleName: middleName || '',
      LastName: lastName,
      Position: position || '',
      Department: department || '',
      Username: username,
      PasswordHash: passwordHash,
      ProfilePicUrl: '',
      DateHired: req.body.dateHired || '',
      DateRetiredResigned: '',
      Role: 'User',
    });

    res.json({ message: 'Registered successfully', userId: newUser.ID, role: newUser.Role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = await sheetsService.getAll('Users');
    const user = users.find((u) => u.Username.toLowerCase() === (username || '').toLowerCase());

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    if (user.DateRetiredResigned) {
      return res.status(403).json({ error: 'This account has been deactivated (retired/resigned)' });
    }

    const valid = await bcrypt.compare(password, user.PasswordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { id: user.ID, username: user.Username, role: user.Role, fullName: `${user.FirstName} ${user.LastName}` },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    await sheetsService.insert('Logs', { UserID: user.ID, Action: 'TimeIn' });

    res.json({
      token,
      user: {
        id: user.ID, firstName: user.FirstName, lastName: user.LastName,
        role: user.Role, department: user.Department, position: user.Position,
        profilePicUrl: user.ProfilePicUrl,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

// POST /api/auth/logout  (records TimeOut log)
router.post('/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    await sheetsService.insert('Logs', { UserID: userId, Action: 'TimeOut' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed', detail: err.message });
  }
});

module.exports = router;
