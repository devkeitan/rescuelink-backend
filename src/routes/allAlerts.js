const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * @swagger
 * components:
 *   schemas:
 *     CombinedIncident:
 *       type: object
 *       properties:
 *         source:
 *           type: string
 *           enum: [alert, crash]
 *         id:
 *           type: integer
 *         userId:
 *           type: integer
 *         status:
 *           type: string
 *         timestamp:
 *           type: string
 *           format: date-time
 *         latitude:
 *           type: number
 *           nullable: true
 *         longitude:
 *           type: number
 *           nullable: true
 *         data:
 *           type: object
 */

/**
 * @swagger
 * /api/v1/allAlerts:
 *   get:
 *     summary: Get all incidents (alerts + crashes) with optional filters
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [alert, crash, all]
 *           default: all
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
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
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of combined incidents with pagination
 *       500:
 *         description: Server error
 */
router.get('/', async (req, res) => {
  try {
    const {
      type = 'all',
      status,
      from,
      to,
      limit = 20,
      offset = 0
    } = req.query;

    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    const userId = req.user.id;
    const userRole = req.user.role;

    // ── Alert query builder (uses assigned_responder_id / assigned_vehicle_id)
    const buildAlertQuery = () => {
      let query = supabase
        .from('alerts')
        .select(`
          *,
          user:user_id(id, first_name, last_name, email, user_phone_number),
          responder:assigned_responder_id(id, first_name, last_name, user_phone_number),
          vehicle:assigned_vehicle_id(id, license_plate, vehicle_type, model, status)
        `, { count: 'exact' })
        .order('reported_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (from)   query = query.gte('reported_at', from);
      if (to)     query = query.lte('reported_at', to);
      if (userRole === 'user') query = query.eq('user_id', userId);

      return query;
    };

    // ── Crash query builder (uses responder_id / vehicle_id)
    const buildCrashQuery = () => {
      let query = supabase
        .from('crash_events')
        .select(`
          *,
          user:user_id(id, first_name, last_name, email, user_phone_number),
          responder:responder_id(id, first_name, last_name, user_phone_number),
          vehicle:vehicle_id(id, license_plate, vehicle_type, model, status)
        `, { count: 'exact' })
        .eq('event_type', 'AUTO_CRASH')
        .order('triggered_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (from)   query = query.gte('triggered_at', from);
      if (to)     query = query.lte('triggered_at', to);
      if (userRole === 'user') query = query.eq('user_id', userId);

      return query;
    };

    // ── Fetch alerts
    let alerts = [];
    if (type === 'alert' || type === 'all') {
      const { data, error } = await buildAlertQuery();
      if (error) throw error;
      alerts = (data || []).map(item => ({
        source: 'alert',
        id: item.id,
        userId: item.user_id,
        status: item.status,
        timestamp: item.reported_at,
        latitude: item.latitude,
        longitude: item.longitude,
        data: item
      }));
    }

    // ── Fetch crashes
    let crashes = [];
    if (type === 'crash' || type === 'all') {
      const { data, error } = await buildCrashQuery();
      if (error) throw error;
      crashes = (data || []).map(item => ({
        source: 'crash',
        id: item.id,
        userId: item.user_id,
        status: item.status,
        timestamp: item.triggered_at,
        latitude: item.latitude,
        longitude: item.longitude,
        data: item
      }));
    }

    // ── Combine, sort, paginate
    const combined = [...alerts, ...crashes]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = combined.length;
    const paginated = combined.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      data: paginated,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        returned: paginated.length
      }
    });

  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
