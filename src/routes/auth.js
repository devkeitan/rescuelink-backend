const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const crypto = require('crypto'); 

const router = express.Router();

async function getUserByEmail(email) {
  const {data, error} = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .single();

    if (error) throw error;
    return data;
}

async function createPasswordReset(user_id){
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const {data, error} = await supabase
    .from('password_resets')
    .insert({
        user_id: user_id,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;
      return token;

}

async function getValidResetToken(token) {
  const now = new Date().toISOString();
  const {data, error} = await supabase
    .from('password_resets')
    .select('id, user_id, expires_at')
    .eq('token', token)
    .gte('expires_at', now)
    .single();
    
    if (error || !data) return null;
    return data;
}

async function deletePasswordReset(resetId) {
  const {error} = await supabase
    .from('password_resets')
    .delete()
    .eq('id', resetId);
    
    if (error) throw error;
}



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
 *               medical_history:
 *                type: string
 *                example: "No known allergies. Previous surgery in 2015."
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
 *                 medical_history:
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
      medical_history,
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
        medical_history,
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




router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    let user;
    try {
        user = await getUserByEmail(email);
    } catch (error) {
        return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent' });
    }
    
    const {error: cleanupError} = await supabase
        .from('password_resets')
        .delete()
        .eq('user_id', user.id);

        if (cleanupError) throw cleanupError;

        const token = await createPasswordReset(user.id);

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

        const transporter =  require('nodemailer').createTransport({
            host: process.env.SMTP_HOST,
            port: 587,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
        });
            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: user.email,
                subject: 'RescueLink Password Reset',
               html: `
        <h2>Reset your password</h2>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>If you didn’t request this, ignore this email. Your password will not change.</p>
      `,
    });

    res.json({ message: 'If account exists, instructions have been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    // 1. Check if token is valid and not expired
    const reset = await getValidResetToken(token);

    if (!reset) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // 2. HASH the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. UPDATE the user's password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', reset.user_id);

    if (updateError) {
      return res.status(500).json({ message: 'Failed to update password' });
    }

    // 4. DELETE the reset record
    await deletePasswordReset(reset.id);

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});





module.exports = router;
