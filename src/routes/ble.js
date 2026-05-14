const express = require('express')
const supabase = require ('../config/supabase')
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { device_id, latitude, longitude, timestamp } = req.body;

    if (!device_id || !timestamp || typeof timestamp !== 'number') {
      return res.status(400).json({
        message: 'device_id and timestamp are required and timestamp must be a number',
      });
    }

    const bleData = {
      user_id: req.user.id,
      device_id,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      timestamp,
    };

    const { data: bleDataRows, error: insertError } = await supabase
      .from('ble')
      .insert([bleData])
      .select('*')
      .single();

    if (insertError) throw insertError;

    // Fetch user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('id', req.user.id)
      .single();

    if (userError) throw userError;

    res.status(201).json({
      message: 'BLE location created',
      data: {
  id: bleDataRows.id,
  deviceId: bleDataRows.device_id,
  latitude: bleDataRows.latitude,
  longitude: bleDataRows.longitude,
  timestamp: bleDataRows.timestamp,
},
      user,   
    });
  } catch (error) {
    console.error('Create BLE error:', error);
    res.status(500).json({
      message: error.message || 'Server error',
    });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { device_id, from, to, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('ble')
      .select(`
        *,
        user:user_id(id, first_name, last_name, email),
        responder_assignments:ble_responder_assignments(
          id,
          status,
          assigned_at,
          responded_at,
          resolved_at,
          unassigned_at,
          responder:responder_id(id, first_name, last_name, email, role)
        ),
        vehicle_assignments:ble_vehicle_assignments(
          id,
          status,
          assigned_at,
          unassigned_at,
          vehicle:vehicle_id(id, license_plate, vehicle_type, status)
        )
      `, { count: 'exact' })
      .order('timestamp', { ascending: false });

    if (device_id) query = query.eq('device_id', device_id);
    if (from) query = query.gte('timestamp', Number(from));
    if (to) query = query.lte('timestamp', Number(to));

    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      message: 'BLE records fetched',
      data,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        returned: data.length,
        total: count
      }
    });
  } catch (error) {
    console.error('Get BLE error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.patch('/:id/responders', authMiddleware, async (req, res) => {
  try {
    const bleId = parseInt(req.params.id);
    const { responder_ids } = req.body;

    if (!bleId || isNaN(bleId)) {
      return res.status(400).json({ message: 'Valid BLE id is required' });
    }

    if (!Array.isArray(responder_ids) || responder_ids.length === 0) {
      return res.status(400).json({ message: 'responder_ids must be a non-empty array' });
    }

    const rowsToInsert = responder_ids.map((responderId) => ({
      ble_id: bleId,
      responder_id: Number(responderId),
      status: 'assigned',
    }));

    const { data, error } = await supabase
      .from('ble_responder_assignments')
      .insert(rowsToInsert)
      .select(`
        id,
        ble_id,
        responder_id,
        status,
        assigned_at,
        responded_at,
        resolved_at,
        unassigned_at,
        responder:responder_id(id, first_name, last_name, email, role)
      `);

    if (error) throw error;

    res.json({
      message: 'Responder(s) assigned successfully',
      data,
    });
  } catch (error) {
    console.error('Assign BLE responders error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.patch('/:id/vehicles', authMiddleware, async (req, res) => {
  try {
    const bleId = parseInt(req.params.id);
    const { vehicle_ids } = req.body;

    if (!bleId || isNaN(bleId)) {
      return res.status(400).json({ message: 'Valid BLE id is required' });
    }

    if (!Array.isArray(vehicle_ids) || vehicle_ids.length === 0) {
      return res.status(400).json({ message: 'vehicle_ids must be a non-empty array' });
    }

    const rowsToInsert = vehicle_ids.map((vehicleId) => ({
      ble_id: bleId,
      vehicle_id: Number(vehicleId),
      status: 'assigned',
    }));

    const { data, error } = await supabase
      .from('ble_vehicle_assignments')
      .insert(rowsToInsert)
      .select(`
        id,
        ble_id,
        vehicle_id,
        status,
        assigned_at,
        unassigned_at,
        vehicle:vehicle_id(id, license_plate, vehicle_type, status)
      `);

    if (error) throw error;

    res.json({
      message: 'Vehicle(s) assigned successfully',
      data,
    });
  } catch (error) {
    console.error('Assign BLE vehicles error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});


/**
 * @swagger
 * tags:
 *   name: BLE
 *   description: BLE location endpoints
 */

/**
 * @swagger
 * /api/v1/emergency:
 *   post:
 *     summary: Create BLE location record
 *     description: Inserts a BLE location entry linked to the authenticated user.
 *     tags: [BLE]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - device_id
 *               - timestamp
 *             properties:
 *               device_id:
 *                 type: string
 *                 description: Unique device identifier
 *                 example: "device_001"
 *               latitude:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Latitude coordinate (optional)
 *                 example: 14.12345
 *               longitude:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Longitude coordinate (optional)
 *                 example: 122.56789
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp (must be a number)
 *                 example: 1714460000
 *     responses:
 *       201:
 *         description: BLE location created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: BLE location created
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "user-uuid"
 *                     device_id:
 *                       type: string
 *                     latitude:
 *                       type: number
 *                       nullable: true
 *                     longitude:
 *                       type: number
 *                       nullable: true
 *                     timestamp:
 *                       type: number
 *       400:
 *         description: Invalid input (missing device_id or invalid timestamp)
 *         content:
 *           application/json:
 *             example:
 *               message: device_id and timestamp are required and timestamp must be a number
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             example:
 *               message: Server error
 */



/**
 * @swagger
 * /api/v1/emergency:
 *   get:
 *     summary: Get BLE location records
 *     description: Fetch BLE location records with optional filters for device and timestamp range. [web:69]
 *     tags: [BLE]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: device_id
 *         required: false
 *         description: Filter by device ID.
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         required: false
 *         description: Return records with timestamp greater than or equal to this Unix timestamp.
 *         schema:
 *           type: number
 *       - in: query
 *         name: to
 *         required: false
 *         description: Return records with timestamp less than or equal to this Unix timestamp.
 *         schema:
 *           type: number
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of records to return.
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *       - in: query
 *         name: offset
 *         required: false
 *         description: Number of records to skip.
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *     responses:
 *       200:
 *         description: BLE records fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: BLE records fetched
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 43
 *                       device_id:
 *                         type: string
 *                         example: device_001
 *                       latitude:
 *                         type: number
 *                         nullable: true
 *                         example: 14.12345
 *                       longitude:
 *                         type: number
 *                         nullable: true
 *                         example: 122.56789
 *                       timestamp:
 *                         type: number
 *                         example: 1714460000
 *                       user_id:
 *                         type: integer
 *                         example: 1
 *                       user:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           first_name:
 *                             type: string
 *                             example: Admin
 *                           last_name:
 *                             type: string
 *                             example: User
 *                           email:
 *                             type: string
 *                             example: admin@gmail.com
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     returned:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Unauthorized, missing or invalid token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Server error
 */

/**
 * @swagger
 * /api/v1/emergency/{id}/responders:
 *   patch:
 *     summary: Assign responders to a BLE incident
 *     description: Assign one or more responders to a BLE incident.
 *     tags: [BLE]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: BLE incident ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - responder_ids
 *             properties:
 *               responder_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [2, 5]
 *     responses:
 *       200:
 *         description: Responder(s) assigned successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */


/**
 * @swagger
 * /api/v1/emergency/{id}/vehicles:
 *   patch:
 *     summary: Assign vehicles to a BLE incident
 *     description: Assign one or more vehicles to a BLE incident.
 *     tags: [BLE]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: BLE incident ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vehicle_ids
 *             properties:
 *               vehicle_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 3]
 *     responses:
 *       200:
 *         description: Vehicle(s) assigned successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
module.exports = router;