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
 *           description: Origin of the incident
 *         id:
 *           type: integer
 *           description: Original ID from the source table
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
 *           description: Original record from the source table (all fields)
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
 *         description: Filter by incident type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (applies to both alerts and crashes)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO) – filters on reported_at (alerts) or triggered_at (crashes)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of combined incidents with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CombinedIncident'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     returned:
 *                       type: integer
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

    // Helper to build base query for a table
    const buildBaseQuery = (table, timestampField) => {
      let query = supabase
        .from(table)
        .select('*', { count: 'exact' });

      // Apply common filters
      if (status) {
        query = query.eq('status', status);
      }
      if (from) {
        query = query.gte(timestampField, from);
      }
      if (to) {
        query = query.lte(timestampField, to);
      }

      // Regular users see only their own records
      if (userRole === 'user') {
        query = query.eq('user_id', userId);
      }

      return query;
    };

    // Fetch alerts if type includes 'alert' or 'all'
    let alerts = [];
    let alertsCount = 0;
    if (type === 'alert' || type === 'all') {
      const alertQuery = buildBaseQuery('alerts', 'reported_at')
        .order('reported_at', { ascending: false });
      // No pagination here – we'll fetch all matching and paginate later
      const { data, error, count } = await alertQuery;
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
      alertsCount = count || 0;
    }

    // Fetch crashes if type includes 'crash' or 'all'
    let crashes = [];
    let crashesCount = 0;
    if (type === 'crash' || type === 'all') {
      const crashQuery = buildBaseQuery('crash_events', 'triggered_at')
        .eq('event_type', 'AUTO_CRASH')
        .order('triggered_at', { ascending: false });
      const { data, error, count } = await crashQuery;
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
      crashesCount = count || 0;
    }

    // Combine and sort by timestamp descending
    let combined = [...alerts, ...crashes];
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = combined.length;

    // Apply pagination
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