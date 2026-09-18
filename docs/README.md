# Secure Multi-Tenant Platform Lab

This is a learning project for building the core architecture behind a secure
enterprise SaaS platform.

It is intentionally **not** an attempt to build a complete company or a
compliance-certified product. The goal is to learn the engineering foundations:

- API design and authentication
- Multi-tenant data isolation
- Rate limiting and usage metering
- Webhooks, queues, retries, and idempotency
- Audit logging and observability
- One real external integration
- Deployment, rollback, and operational documentation

AI, RAG, billing, SAML, and multiple enterprise connectors are deliberately
outside the first version. They can be added later after the core security and
reliability model is correct.

## Why this is a good individual project

The project is large enough to teach production engineering but can be reduced
to one coherent system. It demonstrates more useful depth than implementing
many unrelated demos:

1. A request is authenticated.
2. It is assigned to a tenant.
3. The tenant is enforced by the database.
4. The action is rate-limited and audited.
5. Durable usage and domain events are emitted.
6. Slow or external work is processed asynchronously.
7. The complete operation can be observed and safely retried.

The right target is a **production-style reference implementation**, not a
claim of SOC 2, GDPR, or HIPAA compliance.

## Project outcome

Build a small tenant-aware API for a fictional product called **Workspace API**.
Customers can create workspaces, tasks, and API keys. They can receive signed
webhooks, connect one external provider, and view tenant-scoped usage and
health information.

At the end, the project should support:

- Two or more isolated tenants
- Users, memberships, roles, and API keys
- Tenant-scoped CRUD operations
- PostgreSQL row-level security
- Per-tenant and per-key rate limits
- Durable usage events
- Append-only audit events
- Signed inbound or outbound webhooks
- Background jobs with retries and a dead-letter path
- One connector using an adapter interface
- Request IDs and distributed traces
- A health endpoint and a small tenant dashboard
- Docker-based local deployment
- A documented rollback and recovery procedure

## Scope

### Version 1: required

- Modular monolith API
- PostgreSQL as the source of truth
- Redis for rate limiting and ephemeral coordination
- One worker process for asynchronous jobs
- Tenant-safe caching for read-heavy endpoints
- Local authentication or OIDC
- Tenant context and database RLS
- API keys stored as hashes
- Usage, audit, and outbox events
- Webhook verification, idempotency, and retries
- One external connector or a realistic mock connector
- OpenTelemetry instrumentation
- Automated tests for isolation and failure cases
- Docker Compose and a clear runbook

<!--### Version 2: optional extensions

- SAML SSO through a managed identity provider
- SCIM provisioning
- Salesforce, Slack, HubSpot, and Google Workspace adapters
- Stripe usage billing
- Customer-managed cloud deployment
- Real-time dashboards
- AI/RAG with document-level permissions
- PII detection and redaction
- Formal compliance evidence collection-->

### Explicit non-goals

- Do not begin with microservices.
- Do not implement four integrations before one integration is reliable.
- Do not treat a prompt or frontend check as authorization.
- Do not claim that software alone provides legal compliance.
- Do not use real sensitive customer data while learning.

## Architecture

    Client
      |
      v
    WAF / API gateway
      |
      v
    API application
      |-- authenticate request
      |-- resolve user and tenant context
      |-- apply rate limit
      |-- execute domain operation
      |-- write audit, usage, and outbox events
      |
      +------ PostgreSQL
      |         |-- domain tables
      |         |-- tenant_id on every tenant-owned row
      |         |-- row-level security policies
      |         |-- outbox and idempotency tables
      |
      +------ Redis
      |         |-- rate-limit counters
      |         |-- tenant-safe cached reads
      |         |-- short-lived locks
      |
      +------ Worker
                |-- webhook delivery
                |-- connector synchronization
                |-- retry and dead-letter handling

    API and worker
      |
      +------ OpenTelemetry
                 |-- traces
                 |-- metrics
                 |-- structured logs

Keep the API and worker in one repository and share domain modules. They may
run as separate processes, but they should not become separate services until
there is a real reason.

## Core design rules

### 1. Tenant context is server-derived

The client may request a resource ID, but it must never choose the tenant that
the server trusts. Resolve the tenant from the authenticated identity,
membership, API key, or service credential.

### 2. Every tenant-owned row has tenant_id

Examples:

- tasks
- projects
- integrations
- usage_events
- audit_events

Global tables such as plans or feature definitions may not need tenant_id.

### 3. PostgreSQL RLS is the final isolation boundary

For each request:

1. Authenticate the caller.
2. Resolve the tenant.
3. Open a database transaction.
4. Set a transaction-local tenant value.
5. Query through a database role that cannot bypass RLS.
6. Commit or roll back.

Application filters are still useful, but they are not the only protection.
Write integration tests that deliberately attempt cross-tenant reads, updates,
deletes, exports, and background jobs.

### 4. Redis is not the source of truth

Redis may hold rate-limit counters, cached reads, and temporary state.
Important usage, audit, business, and integration state belongs in PostgreSQL
or durable object storage.

Cache rules:

- Include tenant_id and the relevant authorization scope in every cache key.
- Never serve a cached response before authenticating and resolving the tenant.
- Define a TTL for every cached value.
- Invalidate or refresh related keys after writes.
- Do not cache secrets, tokens, or unnecessary sensitive data.
- Test that tenant A can never receive tenant B's cached response.

Example key:

    tenant:{tenant_id}:tasks:{user_or_role_scope}:{query_hash}

### 5. All external work is idempotent

Retries are normal. A webhook, connector sync, or job must be safe to run more
than once. Use a provider event ID or an idempotency key and enforce uniqueness
in the database.

### 6. Events are emitted through an outbox

Write the business change and its outbox event in the same database transaction.
A worker publishes or processes the outbox later. This prevents a successful
database write from losing its corresponding audit, usage, or webhook event.

### 7. Observability must not leak data

Use request IDs, trace IDs, tenant IDs, resource types, and result codes.
Never put access tokens, API keys, document contents, passwords, or unnecessary
PII in logs, metrics, or traces.

## Initial data model

Start with these tables:

- tenants
- users
- memberships
- api_keys
- tasks
- integrations
- webhook_events
- idempotency_keys
- usage_events
- audit_events
- outbox_events
- job_attempts

Important fields:

- tenants: id, name, status, created_at
- memberships: tenant_id, user_id, role
- api_keys: id, tenant_id, key_prefix, key_hash, last_used_at, revoked_at
- tasks: id, tenant_id, created_by, title, status, created_at
- integrations: id, tenant_id, provider, encrypted_credentials, status
- usage_events: event_id, tenant_id, metric, quantity, occurred_at
- audit_events: event_id, tenant_id, actor_id, action, resource, outcome, request_id, created_at
- outbox_events: event_id, aggregate_type, aggregate_id, event_type, payload, published_at
- webhook_events: provider, provider_event_id, signature_status, received_at, processed_at

Use UUIDs or another non-sequential identifier for externally visible IDs.
Hash API keys and show the full key only once at creation.

## Request flow

For a normal API request:

1. Parse and validate the request.
2. Authenticate the API key or user token.
3. Resolve the tenant and membership.
4. Apply the tenant/key rate limit.
5. Start a transaction and set the tenant context.
6. Execute a query protected by RLS.
7. Write the domain change, audit event, usage event, and outbox event.
8. Commit.
9. Return a request ID.
10. Let the worker process external side effects.

For a webhook:

1. Read the raw request body.
2. Validate the provider signature and timestamp.
3. Store the provider event ID.
4. Reject or ignore duplicates safely.
5. Enqueue work.
6. Return quickly.
7. Retry failures with exponential backoff.
8. Move permanently failing events to a dead-letter state.

## API surface for the first version

Example endpoints:

- POST /v1/auth/api-keys
- DELETE /v1/auth/api-keys/{id}
- GET /v1/me
- GET /v1/tasks
- POST /v1/tasks
- PATCH /v1/tasks/{id}
- DELETE /v1/tasks/{id}
- GET /v1/usage
- GET /v1/audit-events
- GET /v1/health
- POST /v1/webhooks/{provider}
- POST /v1/integrations/{provider}/connect
- POST /v1/integrations/{provider}/sync

Every endpoint should define:

- Authentication requirements
- Tenant and role requirements
- Request and response schema
- Error format
- Rate-limit behavior
- Audit behavior
- Idempotency behavior

## Build milestones

### Milestone 0: project foundation

Deliver:

- Repository structure
- Configuration and environment handling
- Docker Compose for PostgreSQL and Redis
- Health checks
- Database migrations
- Basic CI checks

Done when a fresh clone can start the dependencies and run the test suite.

### Milestone 1: identity and tenancy

Deliver:

- Users, tenants, memberships, and roles
- Local login or OIDC
- API-key creation and revocation
- Tenant context middleware
- RLS policies
- Cross-tenant integration tests

Done when tenant A cannot access tenant B through any API path.

### Milestone 2: core API and protection

Deliver:

- Task or project CRUD
- Validation and consistent errors
- Redis-backed rate limiting
- Cache-aside reads for a selected read-heavy endpoint
- Cache hit, miss, expiration, and invalidation metrics
- Request IDs
- Usage events
- Basic tenant dashboard

Done when limits are enforced, cache keys are tenant-safe, writes do not return
stale data unexpectedly, and usage remains correct after API retries.

### Milestone 3: events and webhooks

Deliver:

- Outbox table and worker
- Audit events
- Webhook signature verification
- Idempotency
- Retry schedule
- Dead-letter handling

Done when a provider timeout causes a safe retry without duplicate business
actions.

### Milestone 4: one connector

Start with one provider. A mock provider is acceptable before a real provider.
Implement an adapter contract:

- authorize
- refresh_credentials
- list_resources
- fetch_resource
- push_event
- handle_rate_limit

Done when the connector can be enabled, synchronized, paused, retried, and
disabled for one tenant without affecting other tenants.

### Milestone 5: operations

Deliver:

- OpenTelemetry traces
- Request, queue, and connector metrics
- Structured logs
- Tenant-scoped health page
- Backup and restore test
- Deployment and rollback runbook

Done when you can follow one request across the API, database, queue, and
connector and recover from a failed deployment.

## Testing strategy

The most important tests are not only unit tests.

- Unit tests for authorization, rate limits, signature validation, and retry timing
- Integration tests for database queries and RLS
- Security tests using two tenants and multiple roles
- Idempotency tests with duplicate requests and duplicate webhook events
- Failure tests for timeouts, worker crashes, and provider rate limits
- Cache tests for hits, misses, expiration, invalidation, and tenant isolation
- Migration tests against a realistic database
- Load tests for the rate limiter and most-used endpoint
- Restore tests for backups

Required security assertions:

- A tenant ID supplied in the request cannot override the authenticated tenant.
- A revoked API key cannot access data.
- A background job cannot process another tenant's resource.
- A user without resource permission cannot retrieve it.
- Secrets never appear in logs.
- A replayed signed webhook is rejected or safely ignored.

## Suggested implementation choices

The exact tools are less important than the boundaries. A practical default is:

- TypeScript with Fastify or NestJS, or Python with FastAPI
- PostgreSQL and a migration tool
- Redis
- A simple worker such as BullMQ, Celery, or a small custom worker
- OpenTelemetry
- Docker Compose
- Managed OIDC later; local authentication first

Choose one language and one database. Avoid adding Kafka, Kubernetes, multiple
clouds, or several databases until the simpler system has a measured problem.

## Eight-week solo schedule

### Weeks 1–2

- Foundation
- Authentication
- Tenant and membership model
- API keys
- PostgreSQL RLS
- Cross-tenant tests

### Weeks 3–4

- Core CRUD API
- Rate limiting
- Usage events
- Audit events
- Outbox and worker
- Webhook verification

### Weeks 5–6

- Retry and dead-letter handling
- One connector
- Connector health
- OpenTelemetry
- Basic dashboard

### Weeks 7–8

- Security hardening
- Backup and restore
- Deployment and rollback
- Documentation
- Runbook
- Failure and load testing

If you are working part-time, expect roughly three months for a polished
version. A fully reliable version of every original feature would take much
longer and is not necessary for the learning outcome.

## Later extensions

After the core project is stable:

1. Add OIDC-based enterprise login.
2. Add SAML through a managed identity provider.
3. Add SCIM provisioning.
4. Add a second connector using the adapter interface.
5. Add usage-based billing with a fake or Stripe-backed ledger.
6. Add document and RAG permissions.
7. Add PII redaction.
8. Add customer-managed deployment.

These extensions should reuse the original tenant, authorization, event, and
observability foundations rather than introducing separate security models.

## Definition of done

The project is complete enough when:

- The architecture can be explained in five minutes.
- Tenant-isolation tests pass.
- API keys are hashed and revocable.
- Rate limits return predictable errors.
- Usage and audit events survive retries.
- Webhooks are verified and idempotent.
- Background failures are observable and recoverable.
- One connector works for multiple tenants.
- No secrets or sensitive content appear in telemetry.
- A backup can be restored.
- A deployment can be rolled back.
- A non-engineer can follow the runbook.
- The README documents known limitations honestly.

This is a strong individual learning project because it teaches how several
production concerns fit together around one consistent security boundary.
