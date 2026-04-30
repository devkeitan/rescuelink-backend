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

module.exports = router;