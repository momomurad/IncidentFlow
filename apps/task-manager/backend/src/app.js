import express from 'express';
import crypto from 'node:crypto';

const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const requestMetrics = new Map();
const sessionMaxAgeSeconds = 60 * 60 * 8;
const sessionCookies = {
  user: 'incidentflow_user_session',
  support: 'incidentflow_support_session',
  admin: 'incidentflow_admin_session'
};

function normalizePath(path) {
  return path.replace(/^\/api\/tasks\/\d+$/, '/api/tasks/:id');
}

function metricKey(method, path, status) {
  return `${method} ${normalizePath(path)} ${status}`;
}

function recordRequest(method, path, status, durationSeconds) {
  const key = metricKey(method, path, status);
  const current = requestMetrics.get(key) ?? { method, path: normalizePath(path), status, count: 0, sum: 0, buckets: buckets.map(() => 0) };
  current.count += 1;
  current.sum += durationSeconds;
  buckets.forEach((bucket, index) => {
    if (durationSeconds <= bucket) current.buckets[index] += 1;
  });
  requestMetrics.set(key, current);
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(values) {
  return Object.entries(values).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',');
}

function renderMetrics() {
  const memory = process.memoryUsage();
  const lines = [
    '# HELP taskroom_up Taskroom backend process health.',
    '# TYPE taskroom_up gauge',
    'taskroom_up 1',
    '# HELP taskroom_process_uptime_seconds Taskroom backend process uptime in seconds.',
    '# TYPE taskroom_process_uptime_seconds gauge',
    `taskroom_process_uptime_seconds ${process.uptime().toFixed(3)}`,
    '# HELP taskroom_process_memory_bytes Taskroom backend memory usage in bytes.',
    '# TYPE taskroom_process_memory_bytes gauge',
    `taskroom_process_memory_bytes{type="rss"} ${memory.rss}`,
    `taskroom_process_memory_bytes{type="heapUsed"} ${memory.heapUsed}`,
    `taskroom_process_memory_bytes{type="heapTotal"} ${memory.heapTotal}`,
    '# HELP taskroom_http_requests_total Total HTTP requests handled by the Taskroom backend.',
    '# TYPE taskroom_http_requests_total counter',
    '# HELP taskroom_http_request_duration_seconds HTTP request duration in seconds.',
    '# TYPE taskroom_http_request_duration_seconds histogram'
  ];

  for (const metric of requestMetrics.values()) {
    const baseLabels = { method: metric.method, route: metric.path, status: metric.status };
    lines.push(`taskroom_http_requests_total{${labels(baseLabels)}} ${metric.count}`);
    buckets.forEach((bucket, index) => {
      lines.push(`taskroom_http_request_duration_seconds_bucket{${labels({ ...baseLabels, le: bucket })}} ${metric.buckets[index]}`);
    });
    lines.push(`taskroom_http_request_duration_seconds_bucket{${labels({ ...baseLabels, le: '+Inf' })}} ${metric.count}`);
    lines.push(`taskroom_http_request_duration_seconds_sum{${labels(baseLabels)}} ${metric.sum.toFixed(6)}`);
    lines.push(`taskroom_http_request_duration_seconds_count{${labels(baseLabels)}} ${metric.count}`);
  }

  return `${lines.join('\n')}\n`;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterations), 32, 'sha256');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index === -1) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function publicUser(user) {
  return user ? { id: user.id, username: user.username, role: user.role } : null;
}

function sessionCookieFor(req) {
  const site = req.headers['x-incidentflow-site'];
  return sessionCookies[site] || sessionCookies.user;
}

const taskSelect = `
  SELECT tasks.*,
         reporter.username AS reporter_username,
         assignee.username AS assigned_to_username,
         resolver.username AS resolved_by_username
  FROM tasks
  LEFT JOIN users reporter ON reporter.id = tasks.reporter_id
  LEFT JOIN users assignee ON assignee.id = tasks.assigned_to_id
  LEFT JOIN users resolver ON resolver.id = tasks.resolved_by_id
`;

function setSessionCookie(req, res, token) {
  res.cookie(sessionCookieFor(req), token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds * 1000
  });
}

function clearSessionCookie(req, res) {
  res.cookie(sessionCookieFor(req), '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function ensureAdminUser(pool) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await pool.query('SELECT id FROM users WHERE role=$1 LIMIT 1', ['admin']);
  if (existing.rowCount) return;
  await pool.query(
    'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
    [username, hashPassword(password), 'admin']
  );
  console.log(`Created initial admin user "${username}". Change the password for real deployments.`);
}

export function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(async (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[sessionCookieFor(req)];
    if (!token) return next();
    try {
      const result = await pool.query(
        `SELECT users.id, users.username, users.role
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash=$1
           AND sessions.expires_at > NOW()
           AND users.active = TRUE`,
        [tokenHash(token)]
      );
      req.user = result.rows[0] || null;
    } catch {
      req.user = null;
    }
    next();
  });
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/metrics') return;
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      recordRequest(req.method, req.route?.path ?? req.path, res.statusCode, durationSeconds);
    });
    next();
  });
  app.get('/metrics', (req, res) => {
    res.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics());
  });
  app.get('/api/health', (req, res) => res.json({ status: 'up' }));
  app.get('/api/ready', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ error: 'Database unavailable' }); }
  });
  const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    next();
  };
  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
    next();
  };
  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Username and password are required' });
    const result = await pool.query('SELECT id, username, password_hash, role FROM users WHERE username=$1 AND active=TRUE', [username.trim()]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,NOW() + ($3 || \' seconds\')::interval)',
      [tokenHash(token), user.id, sessionMaxAgeSeconds]
    );
    setSessionCookie(req, res, token);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[sessionCookieFor(req)];
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
    clearSessionCookie(req, res);
    res.status(204).end();
  });
  app.get('/api/admin/users', requireRole('admin'), async (req, res) => {
    const result = await pool.query('SELECT id, username, role, active, created_at FROM users ORDER BY created_at DESC, id DESC');
    res.json(result.rows);
  });
  app.post('/api/admin/users', requireRole('admin'), async (req, res) => {
    const { username, password, role } = req.body ?? {};
    if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,40}$/.test(username) ||
        typeof password !== 'string' || password.length < 6 ||
        !['user', 'support', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Use a username 3-40 characters, password at least 6 characters, and a valid role.' });
    }
    try {
      const result = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role, active, created_at',
        [username, hashPassword(password), role]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
      throw err;
    }
  });
  app.get('/api/admin/dashboard', requireRole('admin'), async (req, res) => {
    const [totals, supportPerformance, userReporting] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='todo')::int AS open,
               COUNT(*) FILTER (WHERE status='doing')::int AS in_progress,
               COUNT(*) FILTER (WHERE status='done')::int AS resolved,
               COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)
                 FILTER (WHERE status='todo'))::numeric, 1), 0)::float AS avg_open_minutes,
               COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(taken_at, created_at))) / 60)
                 FILTER (WHERE status='doing'))::numeric, 1), 0)::float AS avg_in_progress_minutes,
               COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)
                 FILTER (WHERE status='done' AND resolved_at IS NOT NULL))::numeric, 1), 0)::float AS avg_resolution_minutes
        FROM tasks
      `),
      pool.query(`
        SELECT users.id,
               users.username,
               COALESCE(solved.solved_count, 0)::int AS solved_count,
               COALESCE(active.active_count, 0)::int AS active_count,
               COALESCE(take_time.avg_take_minutes, 0)::float AS avg_take_minutes,
               COALESCE(active.avg_active_minutes, 0)::float AS avg_active_minutes,
               COALESCE(solved.avg_resolution_minutes, 0)::float AS avg_resolution_minutes
        FROM users
        LEFT JOIN (
          SELECT assigned_to_id,
                 ROUND((AVG(EXTRACT(EPOCH FROM (taken_at - created_at)) / 60))::numeric, 1)::float AS avg_take_minutes
          FROM tasks
          WHERE assigned_to_id IS NOT NULL AND taken_at IS NOT NULL
          GROUP BY assigned_to_id
        ) take_time ON take_time.assigned_to_id = users.id
        LEFT JOIN (
          SELECT resolved_by_id,
                 COUNT(*)::int AS solved_count,
                 ROUND((AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60))::numeric, 1)::float AS avg_resolution_minutes
          FROM tasks
          WHERE status='done' AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL
          GROUP BY resolved_by_id
        ) solved ON solved.resolved_by_id = users.id
        LEFT JOIN (
          SELECT assigned_to_id,
                 COUNT(*)::int AS active_count,
                 ROUND((AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(taken_at, created_at))) / 60))::numeric, 1)::float AS avg_active_minutes
          FROM tasks
          WHERE status='doing' AND assigned_to_id IS NOT NULL
          GROUP BY assigned_to_id
        ) active ON active.assigned_to_id = users.id
        WHERE users.role='support'
        ORDER BY solved_count DESC, active_count DESC, users.username ASC
      `),
      pool.query(`
        SELECT users.id,
               users.username,
               COUNT(tasks.id)::int AS total_reports,
               COUNT(tasks.id) FILTER (WHERE tasks.created_at >= CURRENT_DATE)::int AS reports_today,
               COUNT(tasks.id) FILTER (WHERE tasks.created_at >= DATE_TRUNC('month', NOW()))::int AS reports_this_month
        FROM users
        LEFT JOIN tasks ON tasks.reporter_id = users.id
        WHERE users.role='user'
        GROUP BY users.id, users.username
        ORDER BY reports_this_month DESC, reports_today DESC, users.username ASC
      `)
    ]);
    res.json({
      totals: totals.rows[0],
      supportPerformance: supportPerformance.rows,
      userReporting: userReporting.rows
    });
  });
  app.get('/api/me/stats', requireAuth, async (req, res) => {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total_reports,
             COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS reports_today,
             COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()))::int AS reports_this_month,
             COUNT(*) FILTER (WHERE status <> 'done')::int AS active_reports
      FROM tasks
      WHERE reporter_id=$1
    `, [req.user.id]);
    res.json(result.rows[0]);
  });
  app.get('/api/tasks', requireAuth, async (req, res) => {
    const result = await pool.query(`${taskSelect} ORDER BY tasks.created_at DESC, tasks.id DESC`);
    res.json(result.rows);
  });
  const validate = (req, res, next) => {
    const { title, description = '', status = 'todo' } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 160 ||
        typeof description !== 'string' || description.length > 2000 ||
        !['todo', 'doing', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Enter a title (1–160 characters), description up to 2000 characters, and a valid status.' });
    }
    req.task = [title.trim(), description.trim(), status];
    next();
  };
  app.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return res.status(400).json({ error: 'Invalid task ID' });
    next();
  });
  const validateNewIncident = (req, res, next) => {
    validate(req, res, () => {
      if (req.body?.status && req.body.status !== 'todo') {
        return res.status(400).json({ error: 'New incidents must start in Open.' });
      }
      req.task[2] = 'todo';
      next();
    });
  };
  app.post('/api/tasks', requireRole('user', 'support', 'admin'), validateNewIncident, async (req, res) => {
    const result = await pool.query(
      `INSERT INTO tasks (title, description, status, reporter_id)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [...req.task, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  });
  app.put('/api/tasks/:id', requireRole('support', 'admin'), validate, async (req, res) => {
    const existing = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Task not found' });
    const current = existing.rows[0];
    const nextStatus = req.task[2];
    const assignedTo = nextStatus === 'todo' ? null : current.assigned_to_id || req.user.id;
    const takenAt = nextStatus === 'todo' ? null : current.taken_at || new Date();
    const resolvedBy = nextStatus === 'done' ? req.user.id : null;
    const resolvedAt = nextStatus === 'done' ? new Date() : null;
    const result = await pool.query(
      `UPDATE tasks
       SET title=$1,
           description=$2,
           status=$3,
           assigned_to_id=$4,
           taken_at=$5,
           resolved_by_id=$6,
           resolved_at=$7,
           updated_at=NOW()
       WHERE id=$8
       RETURNING *`,
      [...req.task, assignedTo, takenAt, resolvedBy, resolvedAt, req.params.id]
    );
    res.json(result.rows[0]);
  });
  app.delete('/api/tasks/:id', requireRole('support', 'admin'), async (req, res) => {
    const result = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  });
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    console.error('Request failed:', err.code || err.name);
    res.status(500).json({ error: 'Unable to complete request. Please try again.' });
  });
  return app;
}
