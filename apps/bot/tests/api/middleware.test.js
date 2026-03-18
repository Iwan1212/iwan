// tests/api/middleware.test.js — testy middleware auth
const { authMiddleware } = require('../../src/api/middleware');

describe('authMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    delete process.env.DASHBOARD_API_TOKEN;
  });

  it('returns 503 when DASHBOARD_API_TOKEN is not set', () => {
    delete process.env.DASHBOARD_API_TOKEN;
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Dashboard API token not configured' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header', () => {
    process.env.DASHBOARD_API_TOKEN = 'secret123';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has wrong format', () => {
    process.env.DASHBOARD_API_TOKEN = 'secret123';
    req.headers.authorization = 'Basic abc123';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when token is invalid', () => {
    process.env.DASHBOARD_API_TOKEN = 'secret123';
    req.headers.authorization = 'Bearer wrong-token';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when token is valid', () => {
    process.env.DASHBOARD_API_TOKEN = 'secret123';
    req.headers.authorization = 'Bearer secret123';
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('handles empty Bearer token', () => {
    process.env.DASHBOARD_API_TOKEN = 'secret123';
    req.headers.authorization = 'Bearer ';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('is case-sensitive for token comparison', () => {
    process.env.DASHBOARD_API_TOKEN = 'Secret123';
    req.headers.authorization = 'Bearer secret123';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
