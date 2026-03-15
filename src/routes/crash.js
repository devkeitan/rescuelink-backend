const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { getIO } = require('../socketInstance');

const router = express.Router();
router.use(authMiddleware);

const CRASH_SELECT = `
  *,
  user:user_id(id, first_name, last_name),
  responder:responder_id(id, first_name, last_name, user_phone_number),
  vehicle:vehicle_id(id, license_plate, vehicle_type, model, status)
`;

/**
 * @swagger
 * tags:
 *   name: Crash Detection
 *   description: Automatic crash detection from mobile sensors
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CrashEvent:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         user_id:
 *           type: integer
 *         event_type:
 *           type: string
 *           example: AUTO_CRASH
 *         latitude:
 *           type: number
 *           format: float
 *         longitude:
 *           type: number
 *           format: float
 *         impact_force:
 *           type: number
 *           format: float
 *           nullable: true
 *         sensitivity_level:
 *           type: string
 *           nullable: true
 *         stillness_duration:
 *           type: integer
 *           nullable: true
 *         movement_detected:
 *           type: boolean
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [pending, responding, resolved, cancelled]
 *           default: pending
 *         severity:
 *           type: string
 *           enum: [low, medium, high, critical]
 *           nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         source:
 *           type: string
 *           enum: [direct, mesh]
 *           default: direct
 *         packet_id:
 *           type: string
 *           nullable: true
 *           description: Used to avoid duplicate mesh packets
 *         device_id:
 *           type: string
 *           nullable: true
 *           description: Identifies the phone that triggered the crash
 *         triggered_at:
 *           type: string
 *           format: date-time
 *         sent_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         acknowledged_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         resolved_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         device_battery:
 *           type: integer
 *           nullable: true
 *         network_type:
 *           type: string
 *           nullable: true
 *         vehicle_id:
 *           type: integer
 *           nullable: true
 *         responder_id:
 *           type: integer
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             first_name:
 *               type: string
 *             last_name:
 *               type: string
 *         responder:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: integer
 *             first_name:
 *               type: string
 *             last_name:
 *               type: string
 *             user_phone_number:
 *               type: string
 *         vehicle:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: integer
 *             license_plate:
 *               type: string
 *             vehicle_type:
 *               type: string
 *             model:
 *               type: string
 *             status:
 *               type: string
 *
 *     CrashEventUpdate:
 *       type: object
 *       properties:
 *         latitude:
 *           type: number
 *           format: float
 *         longitude:
 *           type: number
 *           format: float
 *         impact_force:
 *           type: number
 *           format: float
 *           nullable: true
 *         sensitivity_level:
 *           type: string
 *           nullable: true
 *         stillness_duration:
 *           type: integer
 *           nullable: true
 *         movement_detected:
 *           type: boolean
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [pending, responding, resolved, cancelled]
 *         severity:
 *           type: string
 *           enum: [low, medium, high, critical]
 *           nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         source:
 *           type: string
 *           enum: [direct, mesh]
 *         packet_id:
 *           type: string
 *           nullable: true
 *         device_id:
 *           type: string
 *           nullable: true
 *         vehicle_id:
 *           type: integer
 *           nullable: true
 *         responder_id:
 *           type: integer
 *           nullable: true
 *         sent_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         acknowledged_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         resolved_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         device_battery:
 *           type: integer
 *           nullable: true
 *         network_type:
 *           type: string
 *           nullable: true
 */

/**
 * @swagger
 * /api/v1/crash:
 *   post:
 *     summary: Automatic crash detection trigger
 *     description: Creates a crash event when a mobile device detects a collision
 *     tags: [Crash Detection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 format: float
 *                 example: 14.5995
 *               longitude:
 *                 type: number
 *                 format: float
 *                 example: 120.9842
 *               impact_force:
 *                 type: number
 *                 format: float
 *                 example: 8.5
 *               device_battery:
 *                 type: integer
 *                 example: 87
 *               network_type:
 *                 type: string
 *                 example: "4g"
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 example: high
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-15T21:00:00Z"
 *               source:
 *                 type: string
 *                 enum: [direct, mesh]
 *                 example: direct
 *               packet_id:
 *                 type: string
 *                 example: "PKT-20260315-001"
 *               device_id:
 *                 type: string
 *                 example: "DEVICE-ABC123"
 *     responses:
 *       201:
 *         description: Crash event created successfully
 *       400:
 *         description: Missing required fields or duplicate packet
 *       500:
 *         description: Server error
 */
router.post('/', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      impact_force,
      device_battery,
      network_type,
      severity,
      timestamp,
      source,
      packet_id,
      device_id,
    } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    // Prevent duplicate mesh packets
    if (packet_id) {
      const { data: existing } = await supabase
        .from('crash_events')
        .select('id')
        .eq('packet_id', packet_id)
        .single();

      if (existing) {
        return res.status(400).json({ message: 'Duplicate packet — crash already recorded' });
      }
    }

    const crashEvent = {
      user_id:        req.user.id,
      event_type:     'AUTO_CRASH',
      latitude,
      longitude,
      impact_force:   impact_force   || null,
      device_battery: device_battery || null,
      network_type:   network_type   || null,
      severity:       severity       || null,
      timestamp:      timestamp      || new Date().toISOString(),
      source:         source         || 'direct',
      packet_id:      packet_id      || null,
      device_id:      device_id      || null,
      status:         'pending',
      triggered_at:   new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('crash_events')
      .insert([crashEvent])
      .select(CRASH_SELECT)
      .single();

    if (error) throw error;

    const io = getIO();
    io.emit('crash:new', data);

    res.status(201).json({ message: 'Crash event recorded', event: data });

  } catch (error) {
    console.error('Crash detection error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/crash:
 *   get:
 *     summary: Get crash events
 *     tags: [Crash Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, responding, resolved, cancelled]
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [direct, mesh]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of crash events with pagination info
 */
router.get('/', async (req, res) => {
  try {
    const { status, severity, source, from, to, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('crash_events')
      .select(CRASH_SELECT, { count: 'exact' })
      .eq('event_type', 'AUTO_CRASH')
      .order('triggered_at', { ascending: false });

    if (status)   query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (source)   query = query.eq('source', source);
    if (from)     query = query.gte('triggered_at', from);
    if (to)       query = query.lte('triggered_at', to);

    if (req.user.role === 'user') {
      query = query.eq('user_id', req.user.id);
    }

    const parsedLimit  = parseInt(limit);
    const parsedOffset = parseInt(offset);
    query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: {
        total:    count,
        limit:    parsedLimit,
        offset:   parsedOffset,
        returned: data.length,
      }
    });

  } catch (error) {
    console.error('Get crash events error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/crash/{id}/assign:
 *   patch:
 *     summary: Assign vehicle and responder to a crash (Admin/Dispatcher only)
 *     tags: [Crash Detection]
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
 *               status:
 *                 type: string
 *                 example: responding
 *     responses:
 *       200:
 *         description: Assignment successful
 *       403:
 *         description: Access denied
 */
router.patch('/:id/assign', async (req, res) => {
  try {
    const { vehicle_id, responder_id, status } = req.body;

    if (!['admin', 'dispatcher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { data: currentCrash, error: fetchError } = await supabase
      .from('crash_events')
      .select('vehicle_id')
      .eq('id', req.params.id)
      .single();

    if (fetchError) throw fetchError;

    const updateData = {
      vehicle_id:   vehicle_id   || null,
      responder_id: responder_id || null,
      updated_at:   new Date().toISOString(),
    };

    if (status) updateData.status = status;

    const { data: updatedCrash, error: updateError } = await supabase
      .from('crash_events')
      .update(updateData)
      .eq('id', req.params.id)
      .select(CRASH_SELECT)
      .single();

    if (updateError) throw updateError;

    // Free old vehicle if replaced
    if (currentCrash?.vehicle_id && currentCrash.vehicle_id !== vehicle_id) {
      await supabase
        .from('vehicles')
        .update({ status: 'available' })
        .eq('id', currentCrash.vehicle_id);
    }

    // Mark new vehicle as assigned
    if (vehicle_id) {
      await supabase
        .from('vehicles')
        .update({ status: 'assigned' })
        .eq('id', vehicle_id);
    }

    const io = getIO();
    io.emit('crash:assigned', updatedCrash);

    res.json(updatedCrash);
  } catch (error) {
    console.error('Assign crash error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/crash/{id}/status:
 *   patch:
 *     summary: Update crash event status
 *     tags: [Crash Detection]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, responding, resolved, cancelled]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['pending', 'responding', 'resolved', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    if (!['admin', 'dispatcher', 'responder'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('crash_events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(CRASH_SELECT)
      .single();

    if (error) throw error;

    // Free vehicle when resolved or cancelled
    if ((status === 'resolved' || status === 'cancelled') && data.vehicle_id) {
      await supabase
        .from('vehicles')
        .update({ status: 'available' })
        .eq('id', data.vehicle_id);
    }

    // Mark vehicle as responding
    if (status === 'responding' && data.vehicle_id) {
      await supabase
        .from('vehicles')
        .update({ status: 'responding' })
        .eq('id', data.vehicle_id);
    }

    const io = getIO();
    io.emit('crash:status_updated', data);

    res.json(data);
  } catch (error) {
    console.error('Update crash status error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/crash/{id}:
 *   put:
 *     summary: Fully update a crash event
 *     tags: [Crash Detection]
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
 *             $ref: '#/components/schemas/CrashEventUpdate'
 *     responses:
 *       200:
 *         description: Crash event updated successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Crash event not found
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('crash_events')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Crash event not found' });
    }

    if (req.user.role === 'user' && existing.user_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to update this event' });
    }

    delete updates.id;
    delete updates.user_id;
    delete updates.event_type;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.triggered_at;

    const { data, error } = await supabase
      .from('crash_events')
      .update(updates)
      .eq('id', id)
      .select(CRASH_SELECT)
      .single();

    if (error) throw error;

    res.json({ message: 'Crash event updated', event: data });

  } catch (error) {
    console.error('Update crash event error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/crash/{id}:
 *   patch:
 *     summary: Partially update a crash event
 *     tags: [Crash Detection]
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
 *             $ref: '#/components/schemas/CrashEventUpdate'
 *     responses:
 *       200:
 *         description: Crash event updated successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Crash event not found
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('crash_events')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Crash event not found' });
    }

    if (req.user.role === 'user' && existing.user_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to update this event' });
    }

    delete updates.id;
    delete updates.user_id;
    delete updates.event_type;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.triggered_at;

    const { data, error } = await supabase
      .from('crash_events')
      .update(updates)
      .eq('id', id)
      .select(CRASH_SELECT)
      .single();

    if (error) throw error;

    res.json({ message: 'Crash event updated', event: data });

  } catch (error) {
    console.error('Patch crash event error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/crash/{id}:
 *   delete:
 *     summary: Delete a crash event
 *     tags: [Crash Detection]
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
 *         description: Crash event deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Crash event not found
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('crash_events')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Crash event not found' });
    }

    if (req.user.role === 'user' && existing.user_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to delete this event' });
    }

    const { error } = await supabase
      .from('crash_events')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Crash event deleted' });

  } catch (error) {
    console.error('Delete crash event error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
