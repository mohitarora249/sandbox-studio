# Sandbox Studio

A local-first web control plane for provisioning and managing isolated development environments. Built with **Next.js App Router, TypeScript, Tailwind CSS, shadcn-style UI primitives, Prisma 7 with the PostgreSQL driver adapter, PostgreSQL, and Docker Engine**.

> **Security boundary:** this is a single-admin development project. The web application can control the Docker daemon, which can effectively grant host-level access. Keep it bound to localhost and only use it on a machine you trust. Do not expose it directly to the internet or allow untrusted users to sign in.

## Features

- Create a sandbox from a form: name, description, Node.js 22 or Python 3.12, CPU, memory, and optional network access.
- Provision one long-lived container and one dedicated Docker named volume per sandbox.
- Start, stop, inspect, and delete environments from the UI.
- Run short commands in a sandbox and fetch recent container logs.
- Persist sandbox configuration and lifecycle events in PostgreSQL through Prisma.
- Enforce a runtime-image allowlist, CPU/memory/PID limits, a non-root runtime user, read-only root filesystem, dropped Linux capabilities, and `no-new-privileges`.
- Keep network access disabled by default and do not publish sandbox ports.
- Admin login, signed `HttpOnly` session cookie, basic login throttling, and same-origin checks on mutating APIs.

## Quick start — Docker Compose

Prerequisites: Docker Desktop (or Docker Engine + Compose), Node.js 22+ and npm if you also plan to run the app outside Compose.

1. **Configure credentials.** Copy `.env.example` to `.env` and replace `AUTH_SECRET` and `ADMIN_PASSWORD` with your own values. For example, generate a secret with `openssl rand -base64 48`. Docker Compose uses the values from `.env` when present.

2. **Build the application and the approved runtime images.** From this folder:

   ```bash
   docker compose build app node-runtime-image python-runtime-image
   ```

   This builds the web control plane plus two locally tagged images:
   - `sandbox-studio/node-runtime:22`
   - `sandbox-studio/python-runtime:3.12`

3. **Start the application and database.**

   ```bash
   docker compose up -d db app
   docker compose logs -f app
   ```

   The app container runs `prisma migrate deploy` before starting Next.js.

4. **Open the dashboard.** Visit [http://localhost:3000](http://localhost:3000). The Compose defaults are `admin` / `please-change-me` only to make a first local run easy; replace them in `.env` before using the app.

5. **Create an environment.** Click **New sandbox**, choose a runtime and resource caps, leave network disabled for the initial test, and create it. On the details page, run `node --version` or `python --version` from the command console.

If Docker Desktop is already running, the app uses the mounted Docker socket at `/var/run/docker.sock`. If socket permissions prevent access, check the owner/group of the host socket and the local Docker Desktop integration. Do not solve this by exposing the daemon over unauthenticated TCP.

### Stop and clean up the application

```bash
# Stop the app and DB, preserving the database volume and sandbox containers.
docker compose down

# Stop app/DB and delete the application's Postgres volume. This does not remove sandbox containers/volumes.
docker compose down -v

# Remove only Sandbox Studio's sandbox containers and volumes from Docker.
# Review the list before deleting any resources.
docker ps -a --filter label=sandbox-studio.managed=true
```

Sandbox containers and workspace volumes are deliberately managed independently of Compose. Deleting a sandbox in the UI removes its container and its workspace volume; stopping the Compose stack does not silently wipe them.

## Run the web app directly on your host

This can be convenient while developing the Next.js UI. Prisma 7 in this project uses a PostgreSQL driver adapter and `prisma.config.ts`; the generated TypeScript client lives in `generated/prisma/` and is created by the generate command. Start PostgreSQL using Compose first:

```bash
cp .env.example .env
# Edit .env so DATABASE_URL points at localhost:5434 and set secure local credentials.
docker compose up -d db
npm install
npm run db:generate
npm run db:deploy
npm run build:runtimes
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For the first local database setup, `npm run db:push` is also available, but the committed migration is the better default for normal development. If you update `schema.prisma`, create a migration with `npm run db:migrate -- --name describe_change` and commit the generated folder.

## Runtime images

`Dockerfile.sandbox` has two build targets. The setup script tags them locally so the API can use an explicit image allowlist. Sandbox creation will fail with a useful error if an image hasn't been built.

```bash
npm run build:runtimes
# equivalent to the two docker build commands shown in package.json
```

The images include a non-root user (`10001:10001`) and a `/workspace` directory that can be mounted as a named volume. The Node runtime includes Node.js/npm; the Python runtime includes Python/pip. A small `coreutils` package provides the `timeout` command used by the sandbox command API.

## API surface

All endpoints except login require a valid admin session. `GET /api/health` is a diagnostic endpoint; it reports database and Docker connectivity, so don't expose it publicly without reviewing that choice.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Create an admin session |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/sandboxes` | List non-deleted sandbox records and sync container status |
| `POST` | `/api/sandboxes` | Validate settings and provision a new container + workspace volume |
| `GET` | `/api/sandboxes/:id` | Fetch sandbox details and recent lifecycle events |
| `POST` | `/api/sandboxes/:id/start` | Start its Docker container |
| `POST` | `/api/sandboxes/:id/stop` | Stop its Docker container |
| `DELETE` | `/api/sandboxes/:id` | Remove container + workspace volume, retain a soft-deleted DB row |
| `GET` | `/api/sandboxes/:id/logs` | Read the last 200 main-process log lines |
| `POST` | `/api/sandboxes/:id/command` | Execute a command inside a running sandbox (15-second limit; output capped at 24 KB) |
| `GET` | `/api/health` | Report PostgreSQL and Docker connection health |

Example create payload:

```json
{
  "name": "node-integration-lab",
  "description": "A scratch environment for trying integration code",
  "runtime": "NODE",
  "cpuCores": 0.5,
  "memoryMb": 512,
  "networkEnabled": false
}
```

The runtime enum, resource limits, and image are validated/mapped server-side. The client never chooses an arbitrary Docker image, Docker command, volume path, or host mount.

## Database model at a glance

- **`Sandbox`** is the source of truth for desired configuration and the last known Docker state. The container ID and workspace volume name link the DB record to Docker resources.
- **`SandboxEvent`** is an append-only-ish timeline for provisioning, lifecycle actions, commands, and failures. It is useful for audit/debugging but is not an execution event log or a tamper-proof audit store.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the component flow, table fields, design decisions, limitations, and the next steps toward a worker/agent execution system.

## Project map

```text
app/
  api/                      # Next.js Route Handlers: auth, health, sandbox lifecycle and command/log APIs
  sandboxes/new/            # Sandbox create page
  sandboxes/[id]/           # Detail, lifecycle controls, logs, command console
components/
  ui/                       # Small shadcn-style primitives (buttons, cards, inputs, switches, etc.)
  dashboard.tsx             # Dashboard and environment table
  sandbox-create-form.tsx   # Form -> POST /api/sandboxes
  sandbox-detail.tsx        # Start/stop/delete, logs and command console
lib/
  auth.ts                   # Signed admin session helpers
  docker.ts                 # Dockerode client + allowlisted runtime image constants
  sandbox-service.ts        # Provisioning/lifecycle logic (kept out of route handlers)
  prisma.ts                 # Hot-reload-safe Prisma client
  validation.ts             # Zod payload schemas and hard bounds
prisma/
  schema.prisma             # Sandbox and SandboxEvent models
  migrations/               # Initial PostgreSQL migration
Dockerfile                  # Next.js control plane image
Dockerfile.sandbox          # Approved runtime image targets
```

## Before using this with untrusted users

This project is a practical local MVP, not a hostile-code execution platform. Docker containers are useful isolation, but a shared-kernel container should not be treated as a complete security boundary against sophisticated malicious code. Before multi-tenant production use:

1. Move Docker provisioning into a dedicated controller/worker service with narrowly scoped internal access; keep the public web tier away from the daemon socket.
2. Add proper identity, organization-level authorization, CSRF policy, shared rate limiting, audit retention, secrets handling, and request quotas.
3. Use per-sandbox network policies/egress proxying; the `networkEnabled` toggle is deliberately simple and is not an egress firewall.
4. Consider gVisor, Kata Containers, a microVM runtime, or another hardened runner for hostile workloads; threat-model host kernel and Docker daemon exposure.
5. Add expiration/garbage collection, orphan reconciliation, durable job handling, metrics, queue backpressure, structured logs, and health alerts.
6. Do not mount production credentials, host folders, Docker sockets, or application databases into sandbox containers.

See [Docker Engine security](https://docs.docker.com/engine/security/) and [Activepieces' sandboxing guide](https://www.activepieces.com/docs/install/architecture/sandboxing) for background on the trust boundary and execution-isolation trade-offs.
