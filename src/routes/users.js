const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

// Protect all routes with auth
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints (Admin only)
 */

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by role
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: available_only
 *         schema:
 *           type: boolean
 *         description: If true, exclude responders currently assigned to a responding alert or crash
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', isAdmin, async (req, res) => {
  try {
    const { role, search, available_only } = req.query;

    let query = supabase
      .from('users')
      .select('id, first_name, middle_name, last_name, ext_name, username, email, user_phone_number, role, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (role) {
      query = query.eq('role', role);
    }

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter out responders currently assigned to a responding alert or crash
    if (available_only === 'true' && data.length > 0) {
      // Get all responder IDs currently busy in alerts
      const { data: busyAlerts } = await supabase
        .from('alerts')
        .select('assigned_responder_id')
        .eq('status', 'responding')
        .not('assigned_responder_id', 'is', null);

      // Get all responder IDs currently busy in crash_events
      const { data: busyCrashes } = await supabase
        .from('crash_events')
        .select('responder_id')
        .eq('status', 'responding')
        .not('responder_id', 'is', null);

      // Combine into a Set for fast lookup
      const busyResponderIds = new Set([
        ...(busyAlerts  || []).map((a) => a.assigned_responder_id),
        ...(busyCrashes || []).map((c) => c.responder_id),
      ]);

      // Return only users not in the busy set
      const filtered = data.filter((u) => !busyResponderIds.has(u.id));
      return res.json(filtered);
    }

    res.json(data);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});


/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User data
 *       404:
 *         description: User not found
 */
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, middle_name, last_name, ext_name, username, email, user_phone_number, role, created_at, updated_at')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
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
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 example: newuser@rescuelink.com
 *               password:
 *                 type: string
 *                 example: password123
 *               first_name:
 *                 type: string
 *                 example: John
 *               last_name:
 *                 type: string
 *                 example: Doe
 *               middle_name:
 *                 type: string
 *               ext_name:
 *                 type: string
 *               username:
 *                 type: string
 *                 example: johndoe
 *               user_phone_number:
 *                 type: string
 *                 example: "09123456789"
 *               role:
 *                 type: string
 *                 enum: [user, admin, responder]
 *                 example: user
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post('/', isAdmin, async (req, res) => {
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
      role = 'user'
    } = req.body;

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !role) {
      return res.status(400).json({ message: 'Required fields are missing' });
    }

    // Validate role
    const validRoles = ['user', 'admin', 'responder'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
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
        role,
      }])
      .select('id, first_name, middle_name, last_name, ext_name, username, email, user_phone_number, role, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Email or username already exists' });
      }
      return res.status(400).json({ message: error.message });
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated successfully
 */
router.put('/:id', isAdmin, async (req, res) => {
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
      role
    } = req.body;

    // Build update object
    const updateData = {
      email,
      first_name,
      last_name,
      middle_name,
      ext_name,
      username,
      user_phone_number,
      role,
      updated_at: new Date().toISOString(),
    };

    // Hash new password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Remove undefined fields
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, first_name, middle_name, last_name, ext_name, username, email, user_phone_number, role, updated_at')
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    // Prevent deleting yourself
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}/role:
 *   patch:
 *     summary: Update user role (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, admin, responder]
 *     responses:
 *       200:
 *         description: Role updated successfully
 */
router.patch('/:id/role', isAdmin, async (req, res) => {
  try {
    const { role } = req.body;

    // Validate role
    const validRoles = ['user', 'admin', 'responder'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Prevent changing your own role
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, first_name, last_name, email, role')
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/users/stats:
 *   get:
 *     summary: Get user statistics (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics
 */
router.get('/stats/overview', isAdmin, async (req, res) => {
  try {
    // Get total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Get users by role
    const { data: roleData } = await supabase
      .from('users')
      .select('role');

    const usersByRole = roleData.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total: totalUsers,
      by_role: usersByRole,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
