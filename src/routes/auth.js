const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');


const router = express.Router();


/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication endpoints
 */


/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - first_name
 *               - last_name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@gmail.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password
 *               first_name:
 *                 type: string
 *                 example: John
 *               last_name:
 *                 type: string
 *                 example: Doe
 *               middle_name:
 *                 type: string
 *                 example: Smith
 *               ext_name:
 *                 type: string
 *                 example: Jr.
 *               username:
 *                 type: string
 *                 example: johndoe
 *               user_phone_number:
 *                 type: string
 *                 example: "09123456789"
 *               relative_number:
 *                 type: string
 *                 example: "09987654321"
 *               birth_date:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-15"
 *               role:
 *                 type: string
 *                 enum: [user, admin, rescuer, dispatcher]
 *                 example: admin
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 email:
 *                   type: string
 *                 first_name:
 *                   type: string
 *                 last_name:
 *                   type: string
 *                 role:
 *                   type: string
 *       400:
 *         description: Bad request
 */
router.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      first_name, 
      last_name, 
      middle_name,
      ext_name,
      username,
      user_phone_number,
      relative_number,
      birth_date,
      role = 'user'
    } = req.body;


    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ message: 'Required fields are missing' });
    }


    const hashedPassword = await bcrypt.hash(password, 10);


    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        password: hashedPassword,
        first_name,
        last_name,
        middle_name,
        ext_name,
        username,
        user_phone_number,
        relative_number,
        birth_date,
        role,
      }])
      .select()
      .single();


    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Email or username already exists' });
      }
      return res.status(400).json({ message: error.message });
    }


    delete data.password;
    res.status(201).json(data);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@rescuelink.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 token_type:
 *                   type: string
 *                   example: bearer
 *                 expires_in:
 *                   type: integer
 *                   example: 3600
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     first_name:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }


    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();



    if (error || !user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }


    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }


    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        name: `${user.first_name} ${user.last_name}`
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );


    delete user.password;


    res.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      user,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 email:
 *                   type: string
 *                 first_name:
 *                   type: string
 *                 last_name:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided' });
    }


    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);


    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .single();


    if (error || !user) {
      return res.status(404).json({ message: 'User not found' });
    }


    delete user.password;
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});


/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});


module.exports = router;
