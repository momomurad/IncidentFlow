import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const labels = {
  todo: 'Open',
  doing: 'In progress',
  done: 'Resolved'
};

const summaries = {
  todo: 'Reported incidents waiting for support',
  doing: 'Tickets taken by support',
  done: 'Closed with recovery notes'
};

const blank = { title: '', description: '', status: 'todo' };
const blankLogin = { username: '', password: '' };
const blankNewUser = { username: '', password: '', role: 'user' };
const blankDashboard = {
  totals: { total: 0, open: 0, in_progress: 0, resolved: 0, avg_open_minutes: 0, avg_in_progress_minutes: 0, avg_resolution_minutes: 0 },
  supportPerformance: [],
  userReporting: []
};
const appMode = ['user', 'support', 'admin'].includes(import.meta.env.VITE_APP_MODE) ? import.meta.env.VITE_APP_MODE : 'user';
const isSupportSite = appMode === 'support';
const isAdminSite = appMode === 'admin';
const isWorkSite = isSupportSite || isAdminSite;
const storedTheme = localStorage.getItem('incidentflow-theme');
const preferredTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

async function api(path = '', options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-IncidentFlow-Site': appMode }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to reach IncidentFlow. Please check the API and database.');
  }
  return res.status === 204 ? null : res.json();
}

function minutesLabel(value) {
  const minutes = Number(value || 0);
  if (!minutes) return '0m';
  if (minutes < 60) return Math.round(minutes) + 'm';
  return (minutes / 60).toFixed(1) + 'h';
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [login, setLogin] = useState(blankLogin);
  const [newUser, setNewUser] = useState(blankNewUser);
  const [users, setUsers] = useState([]);
  const [dashboard, setDashboard] = useState(blankDashboard);
  const [myStats, setMyStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState(storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : preferredTheme);
  const titleInput = useRef(null);

  const openCount = incidents.filter(item => item.status !== 'done').length;
  const resolvedCount = incidents.filter(item => item.status === 'done').length;
  const canUseSite = user && (
    (appMode === 'user' && user.role === 'user') ||
    (appMode === 'support' && user.role === 'support') ||
    (appMode === 'admin' && user.role === 'admin')
  );
  const isAdmin = user?.role === 'admin';

  async function load(currentUser = user) {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const [taskData, extraData] = await Promise.all([
        api('/tasks'),
        isAdminSite && currentUser.role === 'admin'
          ? api('/admin/dashboard')
          : appMode === 'user' && currentUser.role === 'user'
            ? api('/me/stats')
            : Promise.resolve(null)
      ]);
      setIncidents(taskData);
      setDashboard(isAdminSite && currentUser.role === 'admin' ? extraData : blankDashboard);
      setMyStats(appMode === 'user' && currentUser.role === 'user' ? extraData : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const result = await api('/auth/me');
        setUser(result.user);
        if (result.user) await load(result.user);
      } catch (e) {
        setError(e.message);
      } finally {
        setAuthChecked(true);
        setLoading(false);
      }
    }
    checkSession();
  }, []);
  useEffect(() => {
    document.title = isAdminSite ? 'IncidentFlow Admin' : isSupportSite ? 'IncidentFlow Support' : 'Report Incident';
  }, []);
  useEffect(() => {
    localStorage.setItem('incidentflow-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (isAdminSite && isAdmin) loadUsers().catch(e => setError(e.message));
    else setUsers([]);
  }, [isAdmin]);

  function statusPayload(incident, status) {
    return {
      title: incident.title,
      description: incident.description,
      status
    };
  }

  async function submitLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(login) });
      setUser(result.user);
      setLogin(blankLogin);
      await load(result.user);
      setMessage('Logged in.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setAuthChecked(true);
    }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      setIncidents([]);
      setUsers([]);
      setDashboard(blankDashboard);
      setMyStats(null);
      setMessage('Logged out. Choose another account.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadUsers() {
    if (!isAdminSite || !isAdmin) return;
    setUsers(await api('/admin/users'));
  }

  async function loadDashboard() {
    if (!isAdminSite || !isAdmin) return;
    setDashboard(await api('/admin/dashboard'));
  }

  async function loadMyStats() {
    if (user?.role !== 'user') return;
    setMyStats(await api('/me/stats'));
  }

  async function createUser(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser(blankNewUser);
      await loadUsers();
      await loadDashboard();
      setMessage('User created.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = editing ? form : { ...form, status: 'todo' };
      const incident = await api(editing ? '/tasks/' + editing : '/tasks', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      setIncidents(prev => editing
        ? prev.map(item => item.id === editing ? incident : item)
        : [incident, ...prev]);
      if (user?.role === 'admin') await loadDashboard();
      if (user?.role === 'user') await loadMyStats();
      setMessage(editing ? 'Ticket updated.' : 'Incident reported and added to Open.');
      setForm(blank);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(incident) {
    if (!window.confirm('Delete incident "' + incident.title + '"?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/tasks/' + incident.id, { method: 'DELETE' });
      setIncidents(prev => prev.filter(item => item.id !== incident.id));
      if (user?.role === 'admin') await loadDashboard();
      if (editing === incident.id) {
        setEditing(null);
        setForm(blank);
      }
      setMessage('Incident deleted.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(incident, status) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api('/tasks/' + incident.id, {
        method: 'PUT',
        body: JSON.stringify(statusPayload(incident, status))
      });
      setIncidents(prev => prev.map(item => item.id === incident.id ? updated : item));
      if (user?.role === 'admin') await loadDashboard();
      setMessage(status === 'doing'
        ? 'Ticket taken by support.'
        : status === 'done'
          ? 'Ticket resolved.'
          : 'Ticket reopened.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(incident) {
    setEditing(incident.id);
    setForm({
      title: incident.title,
      description: incident.description,
      status: incident.status
    });
    titleInput.current?.focus();
  }

  return (
    <div className="workspace" data-theme={theme}>
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">IF</span>
          <span>{isAdminSite ? 'IncidentFlow Admin' : isSupportSite ? 'IncidentFlow Support' : 'Report Incident'}</span>
        </a>
        <div className="header-actions">
          <span className="workspace-label">{isAdminSite ? 'ADMIN CONSOLE' : isSupportSite ? 'SUPPORT CONSOLE' : 'USER PORTAL'}</span>
          {user && <span className="user-chip">{user.username} · {user.role}</span>}
          {user && (
            <button className="theme-toggle" type="button" onClick={logout} disabled={busy}>
              Logout
            </button>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main>
        <section className="heading">
          <div>
            <p className="eyebrow">{isAdminSite ? 'ADMIN OVERSIGHT' : isSupportSite ? 'SUPPORT WORKQUEUE' : 'INCIDENT REPORTING'}</p>
            <h1>{isAdminSite ? 'Follow the full incident flow and team workload.' : isSupportSite ? 'Take open tickets and drive them to recovery.' : 'Report an incident to the support team.'}</h1>
            <p>{isAdminSite
              ? 'Create accounts, watch support throughput, and measure how reports move from Open to Resolved.'
              : isSupportSite
              ? 'Review new reports, take ownership, move tickets through investigation, and resolve them with recovery notes.'
              : 'Submit what happened and the ticket will land in Open for support to triage.'}</p>
          </div>
          <div className="count" aria-label="Incident summary">
            <strong>{resolvedCount}<span> / {incidents.length}</span></strong>
            <span>resolved tickets</span>
            <small>{openCount} active tickets</small>
          </div>
        </section>

        <section className="signal-strip" aria-label="Operational signals">
          <div><strong>API</strong><span>/api/ready</span></div>
          <div><strong>Metrics</strong><span>taskroom_up 1</span></div>
          <div><strong>{isWorkSite ? 'Workflow' : 'Destination'}</strong><span>{isWorkSite ? 'Open to In progress to Resolved' : 'New reports start in Open'}</span></div>
          <div><strong>Site</strong><span>{isAdminSite ? 'admin localhost:8086' : isSupportSite ? 'support localhost:8085' : 'user localhost:8084'}</span></div>
        </section>

        {appMode === 'user' && myStats && (
          <section className="personal-stats" aria-label="My report summary">
            <div><strong>{myStats.reports_today}</strong><span>reported today</span></div>
            <div><strong>{myStats.reports_this_month}</strong><span>reported this month</span></div>
            <div><strong>{myStats.active_reports}</strong><span>still active</span></div>
          </section>
        )}

        <div className="notice" role="status" aria-live="polite">{message}</div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={load} disabled={busy || loading}>Retry connection</button>
          </div>
        )}

        {!authChecked ? (
          <p className="empty">Checking session...</p>
        ) : !user ? (
          <section className="auth-shell" aria-label="Login">
            <form onSubmit={submitLogin}>
              <div className="form-heading">
                <span className="accent">IF</span>
                <h2>{isAdminSite ? 'Admin login' : isSupportSite ? 'Support login' : 'User login'}</h2>
              </div>
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                value={login.username}
                autoComplete="username"
                required
                onChange={e => setLogin({ ...login, username: e.target.value })}
              />
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={login.password}
                autoComplete="current-password"
                required
                onChange={e => setLogin({ ...login, password: e.target.value })}
              />
              <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Login'}</button>
              <p className="aside-note">
                {isAdminSite
                  ? 'Admin site is separate from support. Use this site only for account creation and dashboard review.'
                  : isSupportSite
                  ? 'Support site is separate from admin. Use a support account here.'
                  : 'Initial local admin: admin / admin123. Use admin to create real user and support accounts.'}
              </p>
            </form>
          </section>
        ) : !canUseSite ? (
          <section className="auth-shell">
            <div className="support-panel">
              <h2>{isAdminSite ? 'Admin access required' : isSupportSite ? 'Support access required' : 'User access required'}</h2>
              <p>{isAdminSite
                ? 'Use an admin account on the admin site.'
                : isSupportSite
                  ? 'Use a support account on the support site.'
                  : 'Use a normal user account on the reporting site.'}</p>
              <button className="primary" type="button" onClick={logout}>Logout</button>
            </div>
          </section>
        ) : (
        <div className="layout">
          <aside>
            {(!isWorkSite || editing) ? <form onSubmit={save}>
              <div className="form-heading">
                <span className="accent">+</span>
                <h2>{editing ? 'Edit ticket' : 'Report incident'}</h2>
              </div>

              <label htmlFor="title">Incident title</label>
              <input
                ref={titleInput}
                id="title"
                value={form.title}
                maxLength={160}
                required
                placeholder="Login page is returning 500"
                disabled={busy}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />

              <label htmlFor="description">What happened? <span className="optional">optional</span></label>
              <textarea
                id="description"
                value={form.description}
                maxLength={2000}
                rows={5}
                placeholder="Who is affected, when it started, error seen, service name..."
                disabled={busy}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />

              {editing && (
                <>
                  <label htmlFor="status">Ticket status</label>
                  <select
                    id="status"
                    value={form.status}
                    disabled={busy}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                  >
                    {Object.entries(labels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </>
              )}

              <button className="primary" disabled={busy || loading}>
                {busy ? 'Saving...' : editing ? 'Save ticket' : 'Report incident'}
              </button>
              {editing && (
                <button
                  type="button"
                  className="cancel"
                  disabled={busy}
                  onClick={() => { setForm(blank); setEditing(null); }}
                >
                  Cancel editing
                </button>
              )}
            </form> : (
              <div className="support-panel">
                <div className="form-heading">
                  <span className="accent">IF</span>
                  <h2>{isAdminSite ? 'Admin console' : 'Support console'}</h2>
                </div>
                <p>{isAdminSite
                  ? 'Create accounts and follow the incident flow without sharing the support login site.'
                  : 'Take tickets from Open, move active work to In progress, then resolve after verification.'}</p>
                <button className="primary" type="button" disabled={busy || loading} onClick={load}>Refresh tickets</button>
                {isAdminSite && isAdmin && (
                  <div className="admin-panel">
                    <h2>Create user</h2>
                    <form onSubmit={createUser}>
                      <label htmlFor="new-username">Username</label>
                      <input
                        id="new-username"
                        value={newUser.username}
                        required
                        onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                      />
                      <label htmlFor="new-password">Password</label>
                      <input
                        id="new-password"
                        type="password"
                        value={newUser.password}
                        minLength={6}
                        required
                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                      />
                      <label htmlFor="new-role">Role</label>
                      <select
                        id="new-role"
                        value={newUser.role}
                        onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                      >
                        <option value="user">Normal user</option>
                        <option value="support">Support user</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="primary" disabled={busy}>Create account</button>
                    </form>
                    <button className="cancel" type="button" onClick={loadUsers}>Refresh users</button>
                    {users.length > 0 && (
                      <ul className="user-list-panel">
                        {users.map(item => <li key={item.id}>{item.username} <span>{item.role}</span></li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="aside-note">
              {isSupportSite
                ? 'This site is for support work only. User reports arrive from the user portal.'
                : isAdminSite
                ? 'This site is for admin oversight only. Support users log in on the support site.'
                : 'Your report goes to Open so support can take and work the ticket.'}
            </p>
          </aside>

          {isWorkSite ? <section className="support-workspace" aria-label={isAdminSite ? 'Admin workspace' : 'Support workspace'}>
            {isAdminSite && isAdmin && (
              <section className="admin-dashboard" aria-label="Admin dashboard">
                <div className="dashboard-heading">
                  <div>
                    <p className="eyebrow">ADMIN DASHBOARD</p>
                    <h2>Flow and support performance</h2>
                  </div>
                  <button className="theme-toggle" type="button" onClick={loadDashboard} disabled={busy || loading}>Refresh</button>
                </div>
                <div className="metric-grid">
                  <div><strong>{dashboard.totals.total}</strong><span>total reports</span></div>
                  <div><strong>{dashboard.totals.open}</strong><span>open</span></div>
                  <div><strong>{dashboard.totals.in_progress}</strong><span>in progress</span></div>
                  <div><strong>{dashboard.totals.resolved}</strong><span>resolved</span></div>
                  <div><strong>{minutesLabel(dashboard.totals.avg_open_minutes)}</strong><span>avg open wait</span></div>
                  <div><strong>{minutesLabel(dashboard.totals.avg_in_progress_minutes)}</strong><span>avg in progress</span></div>
                  <div><strong>{minutesLabel(dashboard.totals.avg_resolution_minutes)}</strong><span>avg resolve time</span></div>
                </div>
                <div className="dashboard-tables">
                  <section>
                    <h3>Support resolution</h3>
                    <table>
                      <thead>
                        <tr><th>Support user</th><th>Solved</th><th>Active</th><th>Avg take</th><th>Avg active</th><th>Avg resolve</th></tr>
                      </thead>
                      <tbody>
                        {dashboard.supportPerformance.length === 0 ? (
                          <tr><td colSpan="6">No support users yet.</td></tr>
                        ) : dashboard.supportPerformance.map(item => (
                          <tr key={item.id}>
                            <td>{item.username}</td>
                            <td>{item.solved_count}</td>
                            <td>{item.active_count}</td>
                            <td>{minutesLabel(item.avg_take_minutes)}</td>
                            <td>{minutesLabel(item.avg_active_minutes)}</td>
                            <td>{minutesLabel(item.avg_resolution_minutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section>
                    <h3>User reporting</h3>
                    <table>
                      <thead>
                        <tr><th>User</th><th>Today</th><th>This month</th><th>Total</th></tr>
                      </thead>
                      <tbody>
                        {dashboard.userReporting.length === 0 ? (
                          <tr><td colSpan="4">No normal users yet.</td></tr>
                        ) : dashboard.userReporting.map(item => (
                          <tr key={item.id}>
                            <td>{item.username}</td>
                            <td>{item.reports_today}</td>
                            <td>{item.reports_this_month}</td>
                            <td>{item.total_reports}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </section>
            )}
            <section className="board" aria-label="Support ticket board">
            {Object.entries(labels).map(([status, label]) => {
              const columnItems = incidents.filter(item => item.status === status);
              return (
                <section className={'column ' + status} key={status}>
                  <div className="column-title">
                    <div>
                      <h2><span className="dot" />{label}</h2>
                      <p>{summaries[status]}</p>
                    </div>
                    <span>{columnItems.length}</span>
                  </div>

                  {loading ? (
                    <p className="empty">Loading incidents...</p>
                  ) : columnItems.length === 0 ? (
                    <div className="empty">
                      <span>-</span>
                      <p>{status === 'todo'
                        ? 'No user reports waiting.'
                        : status === 'doing'
                          ? 'No tickets are taken right now.'
                          : 'Resolved tickets will land here.'}</p>
                    </div>
                  ) : columnItems.map(incident => (
                    <article key={incident.id}>
                      <span className={'badge ' + status}>{label}</span>
                      <h3>{incident.title}</h3>
                      {incident.description && <p className="description">{incident.description}</p>}
                      <div className="card-footer">
                        <time dateTime={incident.created_at}>
                          {new Date(incident.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </time>
                        <div>
                          {status === 'todo' && (
                            <button disabled={busy} aria-label={'Take ' + incident.title} onClick={() => changeStatus(incident, 'doing')}>Take ticket</button>
                          )}
                          {status === 'doing' && (
                            <button disabled={busy} aria-label={'Resolve ' + incident.title} onClick={() => changeStatus(incident, 'done')}>Resolve</button>
                          )}
                          {status === 'done' && (
                            <button disabled={busy} aria-label={'Reopen ' + incident.title} onClick={() => changeStatus(incident, 'todo')}>Reopen</button>
                          )}
                          <button disabled={busy} aria-label={'Edit ' + incident.title} onClick={() => beginEdit(incident)}>Edit</button>
                          <button disabled={busy} className="delete" aria-label={'Delete ' + incident.title} onClick={() => remove(incident)}>Delete</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
            </section>
          </section> : (
            <section className="user-list" aria-label="Submitted incidents">
              <div className="column-title">
                <div>
                  <h2><span className="dot" />Recently reported</h2>
                  <p>Submitted incidents are visible here after they enter the support queue.</p>
                </div>
                <span>{incidents.length}</span>
              </div>
              {loading ? (
                <p className="empty">Loading reports...</p>
              ) : incidents.length === 0 ? (
                <div className="empty"><span>-</span><p>No incidents reported yet.</p></div>
              ) : incidents.slice(0, 8).map(incident => (
                <article key={incident.id}>
                  <span className={'badge ' + incident.status}>{labels[incident.status]}</span>
                  <h3>{incident.title}</h3>
                  {incident.description && <p className="description">{incident.description}</p>}
                  <div className="card-footer">
                    <time dateTime={incident.created_at}>
                      {new Date(incident.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </time>
                    <span className="mode-pill">Ticket #{incident.id}</span>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
        )}

        <footer>
          INCIDENTFLOW
          <span>Built to prove report, triage, resolve, deploy, and clean up.</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
