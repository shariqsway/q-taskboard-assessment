# Production Readiness Review — TaskBoard

**Review date:** 2026-06-12  
**Scope:** Security, authorization, data integrity, test coverage, performance  
**Findings ranked by business impact** (highest first)

---

## Issue #1 — Unauthorized Task Updates (Any Authenticated User)

**File:** `src/app/api/tasks/[id]/route.ts`  
**Line:** 16–37

**Category:** Authorization flaw  
**Severity:** Critical

**Description:**  
`PATCH /api/tasks/:id` only calls `getCurrentUser()` and never checks project membership or role. Unlike `POST` and `DELETE` on tasks — which use `getProjectMembership()` and `canEditTasks()` — any logged-in user who knows a task ID can modify title, status, assignee, and position on any project. This breaks the project-scoped RBAC model and allows viewers and non-members to alter production task data.

**Recommended Fix:**  
Mirror the `DELETE` handler in the same file: load the task, call `getProjectMembership(user.id, existing.projectId)`, return 403 if missing or if `!canEditTasks(membership.role)`, then apply the update. Add integration tests covering viewer (403), non-member (403), and member (200) cases.

**Proof of concept (curl):**

```bash
# 1. Login as dev@example.com — viewer on Q3 Launch only
VIEWER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Get a task ID from Q3 Launch
LAUNCH_ID=$(curl -s http://localhost:3000/api/projects \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['projects'][0]['id'])")

TASK_ID=$(curl -s "http://localhost:3000/api/projects/$LAUNCH_ID" \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['project']['tasks'][0]['id'])")

# 3. Viewer updates a task — expect 403, receive 200
curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -X PATCH "http://localhost:3000/api/tasks/$TASK_ID" \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"PWNED BY VIEWER"}'
```

**Observed response:**

```json
{"task":{"id":"cmq9w0y1s000vmh63n704dva3","projectId":"cmq9w0y1k0006mh63l5zeozpw","title":"PWNED BY VIEWER","description":"Detail for: Prepare customer email blast","status":"todo","assigneeId":"cmq9w0y1h0002mh63b6gfsr4u","createdById":"cmq9w0y1f0000mh63a64q5fx8","position":4,"createdAt":"2026-06-11T19:25:38.272Z","updatedAt":"2026-06-11T19:52:07.678Z","assignee":{"id":"cmq9w0y1h0002mh63b6gfsr4u","name":"Kavya Reddy","email":"kavya@example.com"}}}
HTTP_STATUS:200
```

A non-member (`lina@example.com`, member of Onboarding only) can also PATCH the same task and receives `HTTP_STATUS:200` with `"title":"PWNED BY NON-MEMBER"`, confirming the boundary is authentication-only, not authorization.

---

## Issue #2 — SQL Injection in Task Search

**File:** `src/app/api/projects/[id]/tasks/route.ts`  
**Line:** 27–34

**Category:** SQL injection  
**Severity:** Critical

**Description:**  
When the `?q=` query parameter is present, the handler builds SQL via string interpolation and executes it with `prisma.$queryRawUnsafe()`. Both `projectId` (from the URL) and `q` (user-controlled) are embedded directly into the query string. An attacker can inject arbitrary SQL through `q`, bypassing intended search semantics and potentially reading or modifying database contents depending on Postgres permissions.

**Recommended Fix:**  
Replace `$queryRawUnsafe` with a parameterized query using `prisma.$queryRaw` and tagged template literals (or use Prisma's `findMany` with `contains`/`mode: 'insensitive'`). Never interpolate user input into raw SQL strings. Add a test that asserts malicious `q` values do not alter result cardinality or cause syntax errors.

**Proof of concept (curl):**

```bash
# Normal search — 1 matching task
curl -s "http://localhost:3000/api/projects/$LAUNCH_ID/tasks?q=launch" \
  -H "Authorization: Bearer $VIEWER_TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['tasks']))"
# Output: 1

# Injection payload — returns all 7 tasks in the project
curl -s "http://localhost:3000/api/projects/$LAUNCH_ID/tasks?q=%27%20OR%20%271%27%3D%271" \
  -H "Authorization: Bearer $VIEWER_TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['tasks']))"
# Output: 7
```

The `' OR '1'='1` payload changes the `WHERE` clause logic and returns every task in the project, confirming injectable SQL.

---

## Issue #3 — Password Hash Exposure in Project Detail API

**File:** `src/app/api/projects/[id]/route.ts`  
**Line:** 28–31

**Category:** Security vulnerability (sensitive data exposure)  
**Severity:** High

**Description:**  
`GET /api/projects/:id` uses `include: { owner: true, memberships: { include: { user: true } } }` without field selection. Prisma returns the full `User` model, including `passwordHash`, for the project owner and every member. Any project member — including viewers — receives bcrypt hashes in the JSON response. Hashes can be offline-cracked or used in credential-stuffing attacks if users reuse passwords.

**Recommended Fix:**  
Replace bare `include: { user: true }` and `owner: true` with explicit `select: { id: true, name: true, email: true }` on all user relations. Audit other endpoints for the same pattern. Add an API response test asserting `passwordHash` is never present in serialized output.

**Observed behavior:**

```bash
curl -s "http://localhost:3000/api/projects/$LAUNCH_ID" \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  | python3 -c "import sys,json; p=json.load(sys.stdin)['project']; print('owner.passwordHash len:', len(p['owner']['passwordHash']))"
# Output: owner.passwordHash len: 60
```

Every membership's `user` object in the same response also contains a 60-character bcrypt hash.

---

## Issue #4 — No Database-Level Email Uniqueness

**File:** `prisma/schema.prisma`  
**Line:** 25

**Category:** Data integrity  
**Severity:** Medium

**Description:**  
The `User.email` field has no `@unique` constraint in the Prisma schema or migration. Uniqueness is enforced only in application code at registration (`findFirst` then reject). Concurrent registration requests with the same email can both pass the check and create duplicate accounts, leading to ambiguous login targets and inconsistent membership state. This is a classic race condition that only a database constraint reliably prevents.

**Recommended Fix:**  
Add `@unique` to `email` in `schema.prisma`, generate a migration (`ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)`), and handle Prisma `P2002` unique-violation errors in the register route as a 400 response. Add an integration test for duplicate registration.

---

## Additional Findings (Lower Impact)

| # | File | Line | Category | Severity | Summary |
|---|------|------|----------|----------|---------|
| 5 | `src/tests/` (entire dir) | — | Missing tests | Medium | Only 3 test files (12 tests): JWT unit, Zod schemas, one component. Zero API route, authorization, or RBAC integration tests despite Docker test DB being configured. |
| 6 | `src/app/api/projects/[id]/tasks/route.ts` | 79 | Authorization gap | Low | `assigneeId` on task create is not validated to be a project member; tasks can be assigned to arbitrary user IDs. |
| 7 | `src/app/api/projects/route.ts` | 10–21 | Performance | Low | `GET /api/projects` loads all tasks per project (`include: { tasks: true }`) only to count them. Use `_count: { select: { tasks: true } }` instead. |
| 8 | `.env.example` / `docker-compose.yml` | 25 / 25 | Security | Medium | Default `JWT_SECRET=dev-secret-change-me` shipped in compose; production deploy without rotation enables token forgery. |
| 9 | `src/app/` (no `middleware.ts`) | — | Security | Low | No server-side route protection; pages rely on client-side `localStorage` checks only. API is the real boundary but UX can flash protected content. |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 1 |
| Medium | 3 |
| Low | 3 |

**Blockers before production:** Issues #1 and #2 must be fixed immediately — they allow unauthorized data modification and SQL injection respectively. Issue #3 should be fixed before any external users access the system. Issue #4 and missing authorization tests (#5) should be addressed before scaling user registration.
