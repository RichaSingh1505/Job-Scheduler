process.env.JWT_SECRET = 'test_secret';

jest.mock('../src/models/userModel');
const userModel = require('../src/models/userModel');
const request = require('supertest');
const app = require('../src/app');

describe('POST /api/auth/register', () => {
  test('rejects when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate email', async () => {
    userModel.findByEmail.mockResolvedValueOnce({ id: 1, email: 'a@b.com' });
    const res = await request(app).post('/api/auth/register').send({
      orgName: 'Acme', name: 'Ada', email: 'a@b.com', password: 'secretpass'
    });
    expect(res.status).toBe(409);
  });

  test('creates org + owner and returns a token on success', async () => {
    userModel.findByEmail.mockResolvedValueOnce(null);
    userModel.createOrgAndOwner.mockResolvedValueOnce({ orgId: 10, userId: 20 });
    userModel.findById.mockResolvedValueOnce({ id: 20, org_id: 10, name: 'Ada', email: 'a@b.com', role: 'owner' });

    const res = await request(app).post('/api/auth/register').send({
      orgName: 'Acme', name: 'Ada', email: 'a@b.com', password: 'secretpass'
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('owner');
  });
});

describe('POST /api/auth/login', () => {
  test('rejects unknown email', async () => {
    userModel.findByEmail.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});
