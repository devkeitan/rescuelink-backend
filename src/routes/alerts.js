const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Protect all routes
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Alerts
 *   description: Emergency alert/report management
 */

/**
 * @swagger
 * /api/v1/alerts:
 *   get:
 *     summary: Get all alerts
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: alert_type
 *         schema:
 *           type: string
 *         description: Filter by alert type
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user
 *     responses:
 *       200:
 *         description: List of alerts
 */
router.get('/', async (req, res) => {
  try {
    const { status, alert_type, user_id } = req.query;

    let query = supabase
      .from('alerts')
      .select(`
        *,
        user:user_id(id, first_name, last_name, email, user_phone_number),
        vehicle:assigned_vehicle_id(id, license_plate, vehicle_type, model),
        responder:assigned_responder_id(id, first_name, last_name, user_phone_number)
      `)
      .order('reported_at', { ascending: false });

    // Filters
    if (status) {
      query = query.eq('status', status);
    }

    if (alert_type) {
      query = query.eq('alert_type', alert_type);
    }

    // Regular users can only see their own alerts
    if (req.user.role === 'user') {
      query = query.eq('user_id', req.user.id);
    } else if (user_id) {
      // Admin/dispatcher can filter by user
      query = query.eq('user_id', user_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/alerts/{id}:
 *   get:
 *     summary: Get alert by ID
 *     tags: [Alerts]
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
 *         description: Alert data
 */
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select(`
        *,
        user:user_id(id, first_name, last_name, email, user_phone_number),
        vehicle:assigned_vehicle_id(id, license_plate, vehicle_type, model),
        responder:assigned_responder_id(id, first_name, last_name, user_phone_number)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Regular users can only see their own alerts
    if (req.user.role === 'user' && data.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/alerts:
 *   post:
 *     summary: Create new alert/report
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alert_type
 *               - severity
 *               - title
 *               - location
 *             properties:
 *               alert_type:
 *                 type: string
 *                 enum: [medical, fire, accident, crime, natural_disaster, other]
 *                 example: accident
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 example: high
 *               title:
 *                 type: string
 *                 example: Car Accident on EDSA
 *               description:
 *                 type: string
 *                 example: Two vehicles collided, multiple injuries
 *               location:
 *                 type: string
 *                 example: EDSA Guadalupe, Makati City
 *               latitude:
 *                 type: number
 *                 example: 14.5547
 *               longitude:
 *                 type: number
 *                 example: 121.0244
 *               image_url:
 *                 type: string
 *     responses:
 *       201:
 *         description: Alert created successfully
 */
router.post('/', async (req, res) => {
  try {
    const {
      alert_type,
      severity,
      title,
      description,
      location,
      latitude,
      longitude,
      image_url,
    } = req.body;

    // Validate required fields
    if (!alert_type || !severity || !title || !location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate enums
    const validAlertTypes = ['medical', 'fire', 'accident', 'crime', 'natural_disaster', 'other'];
    const validSeverities = ['low', 'medium', 'high', 'critical'];

    if (!validAlertTypes.includes(alert_type)) {
      return res.status(400).json({ message: 'Invalid alert type' });
    }

    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ message: 'Invalid severity level' });
    }

    const alertData = {
      user_id: req.user.id,
      alert_type,
      severity,
      title: title.trim(),
      description: description?.trim() || null,
      location: location.trim(),
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      image_url: image_url || null,
      status: 'pending',
    };

    const { data, error } = await supabase
      .from('alerts')
      .insert([alertData])
      .select(`
        *,
        user:user_id(id, first_name, last_name, email)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/alerts/{id}:
 *   put:
 *     summary: Update alert (Admin/Dispatcher only)
 *     tags: [Alerts]
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
 *         description: Alert updated successfully
 */
router.put('/:id', async (req, res) => {
  try {
    // Only admin/dispatcher can update
    if (!['admin', 'dispatcher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key =>
      updateData[key] === undefined && delete updateData[key]
    );

    const { data, error } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/alerts/{id}/status:
 *   patch:
 *     summary: Update alert status
 *     tags: [Alerts]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, responding, resolved, cancelled]
 *     responses:
 *       200:
 *         description: Status updated successfully
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['pending', 'responding', 'resolved', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Only admin/dispatcher can update status
    if (!['admin', 'dispatcher', 'rescuer'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updateData = {
      status,
      updated_at: new Date().toISOString(),
    };

     const { data, error } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

 if (status === 'responding' && data.assigned_vehicle_id) {
      await supabase.from('vehicles').update({ status: 'responding' }).eq('id', data.assigned_vehicle_id);
    }

    if (status === 'resolved' && data.assigned_vehicle_id) {
      await supabase.from('vehicles').update({ status: 'available' }).eq('id', data.assigned_vehicle_id);
    }

    res.json(data);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

/**
 * @swagger
 * /api/v1/alerts/{id}/assign:
 *   patch:
 *     summary: Assign vehicle and responder to alert
 *     tags: [Alerts]
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
 *             properties:
 *               vehicle_id:
 *                 type: integer
 *               responder_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Assignment successful
 */
router.patch('/:id/assign', async (req, res) => {
  try {
    const { vehicle_id, responder_id } = req.body;

    if (!['admin', 'dispatcher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // FIX: Use different variable names to avoid redeclaration conflict
    const { data: currentAlert, error: currentAlertError } = await supabase
      .from('alerts')
      .select('assigned_vehicle_id')
      .eq('id', req.params.id)
      .single();

    if (currentAlertError) throw currentAlertError;

    const updateData = {
      assigned_vehicle_id: vehicle_id || null,
      assigned_responder_id: responder_id || null,
      updated_at: new Date().toISOString(),
    };

    // FIX: Use a distinct variable name for the updated alert
    const { data: updatedAlert, error: updateError } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', req.params.id)
      .select(`
        *,
        vehicle:assigned_vehicle_id(id, license_plate, vehicle_type, status),
        responder:assigned_responder_id(id, first_name, last_name)
      `)
      .single();

    if (updateError) throw updateError;

    // Update old vehicle back to available (if it was replaced)
    if (
      currentAlert?.assigned_vehicle_id &&
      currentAlert.assigned_vehicle_id !== vehicle_id
    ) {
      await supabase
        .from('vehicles')
        .update({ status: 'available' })
        .eq('id', currentAlert.assigned_vehicle_id);
    }

    // Update new vehicle to assigned
    if (vehicle_id) {
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .update({ status: 'assigned' })
        .eq('id', vehicle_id);

      if (vehicleError) console.error('Vehicle status update failed:', vehicleError);
    }

    res.json(updatedAlert);
  } catch (error) {
    console.error('Assign alert error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});


/**
 * @swagger
 * /api/v1/alerts/{id}:
 *   delete:
 *     summary: Delete alert (Admin only)
 *     tags: [Alerts]
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
 *         description: Alert deleted successfully
 */
router.delete('/:id', async (req, res) => {
  try {
    // Only admin can delete
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { error } = await supabase
      .from('alerts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Alert deleted successfully' });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
