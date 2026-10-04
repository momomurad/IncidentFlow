import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createApp, hashPassword } from '../src/app.js';

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

test('API auth, roles, CRUD validation and database persistence', async () => {
  assert.ok(process.env.DATABASE_URL, 'Run integration tests with a dedicated configured database');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(await readFile(new URL('../migrations/001-tasks.sql', import.meta.url), 'utf8'));
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminName = 'admin_' + suffix;
  const normalName = 'user_' + suffix;
  const supportName = 'support_' + suffix;
  const password = 'secret123';
  const request = (path, method = 'GET', body, cookie, site = 'user') => fetch(url + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-IncidentFlow-Site': site,
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let id;
  let activeId;
  let adminId;
  let normalId;
  let supportId;

  try {
    await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
      [adminName, hashPassword(password), 'admin']
    );
    adminId = (await pool.query('SELECT id FROM users WHERE username=$1', [adminName])).rows[0].id;

    assert.equal((await request('/api/ready')).status, 200);
    assert.equal((await request('/api/tasks')).status, 401);
    assert.equal((await request('/api/tasks', 'POST', { title: 'No login' })).status, 401);

    const badLogin = await request('/api/auth/login', 'POST', { username: adminName, password: 'wrong' });
    assert.equal(badLogin.status, 401);
    const adminLogin = await request('/api/auth/login', 'POST', { username: adminName, password }, undefined, 'admin');
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookieFrom(adminLogin);
    assert.ok(adminCookie.includes('incidentflow_admin_session='));
    assert.equal((await adminLogin.json()).user.role, 'admin');

    const normalCreate = await request('/api/admin/users', 'POST', { username: normalName, password, role: 'user' }, adminCookie, 'admin');
    assert.equal(normalCreate.status, 201);
    normalId = (await normalCreate.json()).id;
    const supportCreate = await request('/api/admin/users', 'POST', { username: supportName, password, role: 'support' }, adminCookie, 'admin');
    assert.equal(supportCreate.status, 201);
    supportId = (await supportCreate.json()).id;
    assert.equal((await request('/api/admin/users', 'POST', { username: normalName, password, role: 'user' }, adminCookie, 'admin')).status, 409);
    assert.equal((await request('/api/admin/users', 'POST', { username: 'x', password: 'short', role: 'manager' }, adminCookie, 'admin')).status, 400);

    const normalLogin = await request('/api/auth/login', 'POST', { username: normalName, password }, undefined, 'user');
    assert.equal(normalLogin.status, 200);
    const normalCookie = cookieFrom(normalLogin);
    assert.ok(normalCookie.includes('incidentflow_user_session='));
    const supportLogin = await request('/api/auth/login', 'POST', { username: supportName, password }, undefined, 'support');
    assert.equal(supportLogin.status, 200);
    const supportCookie = cookieFrom(supportLogin);
    assert.ok(supportCookie.includes('incidentflow_support_session='));

    assert.equal((await request('/api/admin/users', 'GET', undefined, normalCookie, 'user')).status, 403);
    assert.equal((await request('/api/tasks', 'POST', { title: '   ' }, normalCookie)).status, 400);
    assert.equal((await request('/api/tasks', 'POST', { title: 'Invalid', status: 'unknown' }, normalCookie)).status, 400);
    assert.equal((await request('/api/tasks', 'POST', { title: 'Cannot skip queue', status: 'done' }, normalCookie)).status, 400);
    assert.equal((await request('/api/tasks', 'POST', { title: 'x'.repeat(161) }, normalCookie)).status, 400);
    assert.equal((await request('/api/tasks/abc', 'DELETE', undefined, supportCookie, 'support')).status, 400);

    const create = await request('/api/tasks', 'POST', { title: "Test: 'quoted' task", description: 'integration test', status: 'todo' }, normalCookie);
    assert.equal(create.status, 201);
    const task = await create.json();
    id = task.id;
    assert.equal(task.title, "Test: 'quoted' task");
    assert.equal(task.status, 'todo');
    assert.equal(task.reporter_id, normalId);
    assert.ok((await (await request('/api/tasks', 'GET', undefined, normalCookie)).json()).some(t => t.id === id));

    assert.equal((await request('/api/tasks/' + id, 'PUT', { title: 'Blocked user edit', description: '', status: 'done' }, normalCookie)).status, 403);
    assert.equal((await request('/api/tasks/' + id, 'DELETE', undefined, normalCookie)).status, 403);
    const update = await request('/api/tasks/' + id, 'PUT', { title: 'Updated task', description: 'Saved', status: 'done' }, supportCookie, 'support');
    assert.equal(update.status, 200);
    const resolved = await update.json();
    assert.equal(resolved.status, 'done');
    assert.equal(resolved.assigned_to_id, supportId);
    assert.equal(resolved.resolved_by_id, supportId);
    assert.ok(resolved.resolved_at);
    const persisted = await pool.query('SELECT title, status, reporter_id, assigned_to_id, resolved_by_id, resolved_at FROM tasks WHERE id=$1', [id]);
    assert.equal(persisted.rows[0].title, 'Updated task');
    assert.equal(persisted.rows[0].status, 'done');
    assert.equal(persisted.rows[0].reporter_id, normalId);
    assert.equal(persisted.rows[0].assigned_to_id, supportId);
    assert.equal(persisted.rows[0].resolved_by_id, supportId);
    assert.ok(persisted.rows[0].resolved_at);

    const activeCreate = await request('/api/tasks', 'POST', { title: 'Active incident', description: 'waiting on fix', status: 'todo' }, normalCookie);
    assert.equal(activeCreate.status, 201);
    activeId = (await activeCreate.json()).id;
    const activeUpdate = await request('/api/tasks/' + activeId, 'PUT', { title: 'Active incident', description: 'investigating', status: 'doing' }, supportCookie, 'support');
    assert.equal(activeUpdate.status, 200);
    const active = await activeUpdate.json();
    assert.equal(active.status, 'doing');
    assert.equal(active.assigned_to_id, supportId);
    assert.ok(active.taken_at);

    assert.equal((await request('/api/admin/dashboard', 'GET', undefined, normalCookie, 'user')).status, 403);
    const dashboardResponse = await request('/api/admin/dashboard', 'GET', undefined, adminCookie, 'admin');
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();
    const supportRow = dashboard.supportPerformance.find(row => row.id === supportId);
    const userRow = dashboard.userReporting.find(row => row.id === normalId);
    assert.ok(dashboard.totals.resolved >= 1);
    assert.ok(Number.isFinite(dashboard.totals.avg_open_minutes));
    assert.ok(Number.isFinite(dashboard.totals.avg_in_progress_minutes));
    assert.ok(Number.isFinite(dashboard.totals.avg_resolution_minutes));
    assert.equal(supportRow.solved_count, 1);
    assert.equal(supportRow.active_count, 1);
    assert.ok(Number.isFinite(supportRow.avg_take_minutes));
    assert.ok(Number.isFinite(supportRow.avg_active_minutes));
    assert.ok(Number.isFinite(supportRow.avg_resolution_minutes));
    assert.equal(userRow.reports_today, 2);
    assert.equal(userRow.reports_this_month, 2);
    assert.equal(userRow.total_reports, 2);
    const myStats = await (await request('/api/me/stats', 'GET', undefined, normalCookie)).json();
    assert.equal(myStats.reports_today, 2);
    assert.equal(myStats.reports_this_month, 2);
    assert.equal(myStats.total_reports, 2);
    assert.equal(myStats.active_reports, 1);
    assert.equal((await request('/api/tasks/' + activeId, 'DELETE', undefined, supportCookie, 'support')).status, 204);
    activeId = null;
    assert.equal((await request('/api/tasks/' + id, 'DELETE', undefined, supportCookie, 'support')).status, 204);
    assert.equal((await request('/api/tasks/' + id, 'DELETE', undefined, supportCookie, 'support')).status, 404);
    assert.equal((await request('/api/tasks/' + id, 'PUT', { title: 'Missing' }, supportCookie, 'support')).status, 404);
    assert.equal((await pool.query('SELECT id FROM tasks WHERE id=$1', [id])).rowCount, 0);
    id = null;

    const malformed = await fetch(url + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: normalCookie }, body: '{broken' });
    assert.equal(malformed.status, 400);
    assert.equal((await request('/api/auth/logout', 'POST', undefined, normalCookie)).status, 204);
  } finally {
    if (id) await pool.query('DELETE FROM tasks WHERE id=$1', [id]);
    if (activeId) await pool.query('DELETE FROM tasks WHERE id=$1', [activeId]);
    const userIds = [adminId, normalId, supportId].filter(Boolean);
    if (userIds.length) {
      await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::int[])', [userIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
    }
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});

test('readiness reports database outage without exposing internals', async () => {
  const pool = { query: async () => { throw new Error('private database detail'); } };
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/ready');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Database unavailable' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('metrics endpoint exposes Prometheus text and request counters', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(url + '/api/health')).status, 200);
    const response = await fetch(url + '/metrics');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    const body = await response.text();
    assert.match(body, /# HELP taskroom_up/);
    assert.match(body, /taskroom_up 1/);
    assert.match(body, /taskroom_http_requests_total\{method="GET",route="\/api\/health",status="200"\} 1/);
    assert.match(body, /taskroom_http_request_duration_seconds_count\{method="GET",route="\/api\/health",status="200"\} 1/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
