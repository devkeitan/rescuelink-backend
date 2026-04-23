const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// If running in tests, export a fake client and exit early
if (process.env.NODE_ENV === 'test') {
  const supabaseClient = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
          session: {
            access_token: 'fake-jwt-token',
          },
        },
        error: null,
      }),
      signUp: async () => ({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
        error: null,
      }),
    },
    from: (table) => ({
      select: async () => ({
        data: [],
        error: null,
      }),
      insert: async (data) => ({
        data: Array.isArray(data) ? data : [data],
        error: null,
      }),
      update: async (data) => ({
        data: [data],
        error: null,
      }),
    }),
  };

  module.exports = supabaseClient;
}

// If we are not in test mode, use real Supabase
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = supabase;