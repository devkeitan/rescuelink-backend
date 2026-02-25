const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

const router = express.Router();
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Generate reports and statistics for incidents (alerts + crashes)
 */

/**
 * @swagger
 * /api/v1/reports/incidents:
 *   get:
 *     summary: Get incident data for reporting
 *     description: Retrieve combined incident data with optional filters. Returns JSON by default. Use format=csv to download CSV.
 *     tags: [Reports]
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
 *         description: Filter by status (applies to both)
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
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user ID (admin/dispatcher only)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, pdf]
 *           default: json
 *         description: Response format
 *     responses:
 *       200:
 *         description: Incident data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   source:
 *                     type: string
 *                   id:
 *                     type: integer
 *                   user_id:
 *                     type: integer
 *                   user_name:
 *                     type: string
 *                   user_email:
 *                     type: string
 *                   status:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *                   alert_type:
 *                     type: string
 *                   severity:
 *                     type: string
 *                   title:
 *                     type: string
 *                   description:
 *                     type: string
 *                   location:
 *                     type: string
 *                   image_url:
 *                     type: string
 *                   assigned_vehicle_id:
 *                     type: integer
 *                   assigned_responder_id:
 *                     type: integer
 *                   impact_force:
 *                     type: number
 *                   sensitivity_level:
 *                     type: string
 *                   stillness_duration:
 *                     type: integer
 *                   movement_detected:
 *                     type: boolean
 *                   device_battery:
 *                     type: integer
 *                   network_type:
 *                     type: string
 *                   triggered_at:
 *                     type: string
 *                   sent_at:
 *                     type: string
 *                   acknowledged_at:
 *                     type: string
 *                   resolved_at:
 *                     type: string
 *                   is_automatic:
 *                     type: boolean
 *       500:
 *         description: Server error
 */
router.get('/incidents', async (req, res) => {
  try {
    const {
      type = 'all',
      status,
      from,
      to,
      user_id,
      format = 'json'
    } = req.query;

    // Authorization: check user_id filter permission
    if (user_id && req.user.role === 'user' && parseInt(user_id) !== req.user.id) {
      return res.status(403).json({ message: 'You can only request your own data' });
    }

    // Fetch alerts
    let alerts = [];
    if (type === 'alert' || type === 'all') {
      let alertQuery = supabase
        .from('alerts')
        .select(`
          *,
          user:user_id(id, first_name, last_name, email)
        `)
        .order('reported_at', { ascending: false });

      // Apply common filters
      if (status) alertQuery = alertQuery.eq('status', status);
      if (from) alertQuery = alertQuery.gte('reported_at', from);
      if (to) alertQuery = alertQuery.lte('reported_at', to);

      // User filter
      if (req.user.role === 'user') {
        alertQuery = alertQuery.eq('user_id', req.user.id);
      } else if (user_id) {
        alertQuery = alertQuery.eq('user_id', user_id);
      }

      const { data, error } = await alertQuery;
      if (error) throw error;
      alerts = data || [];
    }

    // Fetch crashes
    let crashes = [];
    if (type === 'crash' || type === 'all') {
      let crashQuery = supabase
        .from('crash_events')
        .select(`
          *,
          user:user_id(id, first_name, last_name)
        `)
        .eq('event_type', 'AUTO_CRASH')
        .order('triggered_at', { ascending: false });

      if (status) crashQuery = crashQuery.eq('status', status);
      if (from) crashQuery = crashQuery.gte('triggered_at', from);
      if (to) crashQuery = crashQuery.lte('triggered_at', to);

      if (req.user.role === 'user') {
        crashQuery = crashQuery.eq('user_id', req.user.id);
      } else if (user_id) {
        crashQuery = crashQuery.eq('user_id', user_id);
      }

      const { data, error } = await crashQuery;
      if (error) throw error;
      crashes = data || [];
    }

    // Transform to unified format
    const transformedAlerts = alerts.map(a => ({
      source: 'alert',
      id: a.id,
      user_id: a.user_id,
      user_name: a.user ? `${a.user.first_name} ${a.user.last_name}`.trim() : null,
      user_email: a.user?.email,
      status: a.status,
      timestamp: a.reported_at,
      latitude: a.latitude,
      longitude: a.longitude,
      alert_type: a.alert_type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      location: a.location,
      image_url: a.image_url,
      assigned_vehicle_id: a.assigned_vehicle_id,
      assigned_responder_id: a.assigned_responder_id,
      is_automatic: false
    }));

    const transformedCrashes = crashes.map(c => ({
      source: 'crash',
      id: c.id,
      user_id: c.user_id,
      user_name: c.user ? `${c.user.first_name} ${c.user.last_name}`.trim() : null,
      user_email: null,
      status: c.status,
      timestamp: c.triggered_at,
      latitude: c.latitude,
      longitude: c.longitude,
      impact_force: c.impact_force,
      sensitivity_level: c.sensitivity_level,
      stillness_duration: c.stillness_duration,
      movement_detected: c.movement_detected,
      device_battery: c.device_battery,
      network_type: c.network_type,
      triggered_at: c.triggered_at,
      sent_at: c.sent_at,
      acknowledged_at: c.acknowledged_at,
      resolved_at: c.resolved_at,
      is_automatic: true
    }));

    // Combine and sort by timestamp desc
    let combined = [...transformedAlerts, ...transformedCrashes];
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Handle response format
    if (format === 'csv') {
      const fields = [
        'source', 'id', 'user_id', 'user_name', 'user_email', 'status', 'timestamp',
        'latitude', 'longitude', 'alert_type', 'severity', 'title', 'description',
        'location', 'image_url', 'assigned_vehicle_id', 'assigned_responder_id',
        'impact_force', 'sensitivity_level', 'stillness_duration', 'movement_detected',
        'device_battery', 'network_type', 'triggered_at', 'sent_at', 'acknowledged_at',
        'resolved_at', 'is_automatic'
      ];
      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(combined);
      res.header('Content-Type', 'text/csv');
      res.attachment(`incidents_${new Date().toISOString().slice(0,10)}.csv`);
      return res.send(csv);
    }

    if (format === 'pdf') {
      // Generate PDF using PDFKit
      const doc = new PDFDocument();
      const filename = `incidents_${new Date().toISOString().slice(0,10)}.pdf`;
      res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-type', 'application/pdf');

      doc.pipe(res);

      // Title
      doc.fontSize(18).text('Incidents Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // Summary
      doc.fontSize(14).text(`Total Incidents: ${combined.length}`);
      doc.text(`Alerts: ${transformedAlerts.length}`);
      doc.text(`Crashes: ${transformedCrashes.length}`);
      doc.moveDown();

      // List incidents (limit to 50 for PDF size)
      combined.slice(0, 50).forEach((inc, idx) => {
        doc.fontSize(10).text(`${idx+1}. [${inc.source.toUpperCase()}] ID: ${inc.id} | Status: ${inc.status} | Time: ${new Date(inc.timestamp).toLocaleString()}`);
        if (inc.alert_type) doc.text(`   Type: ${inc.alert_type}, Severity: ${inc.severity}, Title: ${inc.title}`);
        if (inc.impact_force) doc.text(`   Impact: ${inc.impact_force} g, Battery: ${inc.device_battery}%`);
        doc.moveDown(0.5);
      });

      doc.end();
      return;
    }

    // Default JSON response
    res.json(combined);

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/v1/reports/summary:
 *   get:
 *     summary: Get summary statistics
 *     description: Provides counts and breakdowns of incidents
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *     responses:
 *       200:
 *         description: Summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_alerts:
 *                   type: integer
 *                 total_crashes:
 *                   type: integer
 *                 alerts_by_status:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                       count:
 *                         type: integer
 *                 crashes_by_status:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                       count:
 *                         type: integer
 *       500:
 *         description: Server error
 */
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;

    // Helper to build count query with filters
    const buildCountQuery = (table, timestampField) => {
      let query = supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (from) query = query.gte(timestampField, from);
      if (to) query = query.lte(timestampField, to);

      if (req.user.role === 'user') {
        query = query.eq('user_id', req.user.id);
      }

      return query;
    };

    const alertsCount = await buildCountQuery('alerts', 'reported_at');
    const crashesCount = await buildCountQuery('crash_events', 'triggered_at');

    // Status breakdown
    const getStatusBreakdown = async (table, timestampField) => {
      let query = supabase
        .from(table)
        .select('status, count');

      if (from) query = query.gte(timestampField, from);
      if (to) query = query.lte(timestampField, to);
      if (req.user.role === 'user') query = query.eq('user_id', req.user.id);

      // Group by status
      query = query.group('status');

      const { data, error } = await query;
      if (error) throw error;
      return data;
    };

    const alertStatuses = await getStatusBreakdown('alerts', 'reported_at');
    const crashStatuses = await getStatusBreakdown('crash_events', 'triggered_at');

    const summary = {
      total_alerts: alertsCount.count,
      total_crashes: crashesCount.count,
      alerts_by_status: alertStatuses,
      crashes_by_status: crashStatuses
    };

    res.json(summary);
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;