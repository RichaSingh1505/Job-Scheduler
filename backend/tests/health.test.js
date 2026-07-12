const request = require('supertest');
process.env.JWT_SECRET = 'test_secret';
const app = require('../src/app');

describe('GET /health', () => {
  test('returns 200 and status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('unknown routes', () => {
  test('returns 404 with an error message', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('auth-protected routes', () => {
  test('rejects requests without a bearer token', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  test('rejects requests with a malformed token', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
