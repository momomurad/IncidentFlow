# IncidentFlow — DevOps incident lab

React UI → Nginx `/api` proxy → Express API → PostgreSQL.

This local lab app supports creating, viewing, editing, resolving, and deleting
incident records. It is designed as a DevOps portfolio app for tracking
failures, diagnostics, rollback tags, and recovery verification. It now includes
local login, admin-created accounts, and role-based access for normal users,
support users, and admins. Compose publishes three frontends on Windows loopback;
the API and database stay on the internal network.

Local sites:

- User incident-reporting site: `http://localhost:8084`
- Support ticket console: `http://localhost:8085`
- Admin console and dashboard: `http://localhost:8086`

## Ticket workflow

IncidentFlow behaves like a small support ticket system:

```text
User reports incident -> Open -> support takes ticket -> In progress -> Resolved
```

New incident reports always start in `Open`. Support can take a ticket, resolve
it, reopen it, edit details, or delete a test record. The backend enforces that
new reports cannot skip directly to `Resolved`.

## Login and roles

The backend creates one initial local admin user if no admin exists:

```text
username: admin
password: admin123
```

Use the admin console at `http://localhost:8086` to log in as admin and create
real accounts:

- `user`: can log in to the user site, report incidents, and view tickets.
- `support`: can log in to the support site, take, update, resolve, reopen, and delete tickets.
- `admin`: can log in to the admin site, create accounts, review dashboard metrics, and inspect tickets.

The three local sites use separate session cookies:

- `incidentflow_user_session`
- `incidentflow_support_session`
- `incidentflow_admin_session`

This keeps admin login on `8086` separate from support login on `8085`, even
though both run on `localhost`.

For any cloud or shared proof, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in
`.env` before the first backend startup, or change the default password by
creating a new admin and removing the lab-only default directly from the
database. This is intentionally small lab authentication, not production SSO.

## Admin dashboard

Admins see a dashboard on the admin site above the ticket board. It tracks:

- total, open, in-progress, and resolved reports
- average open wait time
- average in-progress age
- average resolution time
- solved ticket count per support user
- active in-progress ticket count per support user
- average time to take, active ticket age, and resolution time per support user
- normal user report counts for today, this month, and all time

Normal users also see their own report counts for today, this month, and active
reports on the user site. Dashboard data comes from ticket ownership fields in
PostgreSQL: `reporter_id`, `assigned_to_id`, `resolved_by_id`, `taken_at`, and
`resolved_at`.

## Start on Windows

From `D:\IncidentFlow\apps\task-manager`:

```powershell
# First setup only; do not overwrite an existing .env.
Copy-Item .env.example .env
# Edit .env: set POSTGRES_PASSWORD to a random alphanumeric password.
docker compose up -d --build --wait
```

Open http://localhost:8084 for the user incident-reporting site.
Open http://localhost:8085 for the support ticket console.
Open http://localhost:8086 for the admin console and admin user setup.
Docker Desktop must be running.
The automatically prepared `.env` on this workstation already contains a random
local password. Do not commit it. Use URL-safe alphanumeric characters because
the value is interpolated into the API database connection URL.

## Check and test

```powershell
docker compose ps
docker compose exec -T backend npm test --workspace=backend
curl.exe http://localhost:8084/api/ready
curl.exe http://localhost:8085/api/ready
curl.exe http://localhost:8086/api/ready
```

The integration test creates its own record, verifies CRUD, ticket validation,
login, admin user creation, role permissions, dashboard statistics, user report
counts, support resolution tracking, and database persistence against
PostgreSQL, then deletes only its temporary users and record. The UI is compiled
during the frontend image build. `/api/health` checks the API process;
`/api/ready` checks the database connection. The backend also exposes
Prometheus-format metrics at `/metrics`, including process health, memory,
request totals, and request duration buckets.

## SonarQube analysis

The repository-side analysis scope is defined in `sonar-project.properties`.
It analyzes `backend/src` and `frontend/src`, classifies `backend/test` as test
code, and excludes generated dependencies, builds, and coverage output.

The SonarQube server is available to Windows at `http://localhost:9000` and to
Jenkins at `http://192.168.56.20:9000`. Store the analysis token only in
Jenkins Secret Text credentials as `SonarQube`; never add it to this
file, the Jenkinsfile, or Git.

Analysis uses the existing project key `devops-k8s-project`, matching the
existing project-scoped token. Jenkins uses server configuration
`sonarqube-taskroom` and tool `SonarScanner`. DEPLOY runs analysis after tests
and the frontend build, then waits up to 10 minutes for the quality gate.
A failed gate or timeout stops the pipeline before Docker images are built,
pushed, or deployed. ROLLBACK skips analysis to allow recovery.

The project webhook sends results to
`http://192.168.56.10:8080/sonarqube-webhook/`. After committing and pushing,
check the **SonarQube analysis** and **Quality gate** stages in Jenkins and
the `devops-k8s-project` dashboard in SonarQube. No coverage report is generated
by this integration yet; successful tests alone do not provide SonarQube
coverage data. Address reported gate failures before expecting deployment.

## Persistence and stopping

PostgreSQL data is kept in named volume `lab-task-manager_task-data`.
`docker compose stop` stops this app without deleting data; `docker compose up -d`
starts it again. `docker compose down` also retains the volume. Do not add `-v`
unless deliberately deleting this app's database. Changing the password in
`.env` does not change the password inside an already initialized database.

## Source layout

- `frontend/src/`: IncidentFlow React interface and responsive styles.
- `frontend/nginx.conf`: same-origin API proxy, avoiding browser CORS setup.
- `backend/src/`: Express routes, validation, parameterized SQL, shutdown.
- `backend/migrations/001-tasks.sql`: repeatable initial schema, run at startup.
- `backend/test/`: real database integration tests.
- `compose.yaml`: three services, health checks, internal networking, named volume.

The initial migration is idempotent. Future schema changes should use new,
versioned migrations with a migration ledger instead of modifying this file.

## Next checkpoint

After this local stack is verified, build versioned frontend/API images, push
them to Docker Hub, and add Kubernetes resources in a separate namespace. Use
a PostgreSQL PVC and runtime Secret, resource limits, readiness checks, and
Windows forwarding. The Nginx Docker DNS resolver must be adjusted for Kubernetes.
Then monitor the backend through Prometheus/Grafana with the ServiceMonitor in
`kubernetes/task-manager/monitoring.yaml`. Existing `testjs`, demo, and
WordPress deployments remain separate.

# The final flow

GitHub -> Jenkins tests/build -> SonarQube analysis -> Quality gate -> Docker Hub -> Minikube deploy -> smoke test
