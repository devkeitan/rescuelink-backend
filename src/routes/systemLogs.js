const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

router.use(authMiddleware);

const logAction = async ({ userId, recordId, action, entityName, status, message }) => {
  try {
    const { error } = await supabase.from('system_logs').insert([{
      user_id:     userId,
      record_id:   recordId,
      action,
      entity_name: entityName,
      status,
      message,
    }]);
    if (error) console.error('[logAction] Insert error:', error.message);
  } catch (err) {
    console.error('[logAction] Unexpected error:', err.message);
  }
};

router.get('/', isAdmin, async (req, res) => {
  try {
    const {
      search,
      entity_name,
      action,
      date_from,
      date_to,
      page = 1,
    } = req.query;

    const LIMIT  = 10;
    const offset = (parseInt(page) - 1) * LIMIT;

    let query = supabase
      .from('system_logs')
      .select(`
        *,
        user:user_id(id, first_name, last_name, username, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + LIMIT - 1);

    if (search)      query = query.ilike('message', `%${search}%`);
    if (entity_name) query = query.eq('entity_name', entity_name);
    if (action)      query = query.eq('action', action);
    if (date_from)   query = query.gte('created_at', date_from);
    if (date_to)     query = query.lte('created_at', date_to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: {
        total:        count,
        per_page:     LIMIT,
        current_page: parseInt(page),
        total_pages:  Math.ceil(count / LIMIT),
      },
    });
  } catch (error) {
    console.error('Get system logs error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
module.exports.logAction = logAction;