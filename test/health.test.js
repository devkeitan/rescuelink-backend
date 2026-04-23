const request = require('supertest');
const app = require('../src/server.js');

describe('Health Check', () => {
  it('should return 200 and status ok', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
      })
    );
  });
});