# Technical Specification

## Global Wellness - Database Schema and API Contract Pack

This document is the engineering handoff companion to the PRD and is designed for backend, frontend, and QA implementation.

## 1) Architecture Scope

- Backend: Node.js + Express + MongoDB (Mongoose)
- Frontend: Next.js
- Auth: JWT bearer token
- Realtime: socket notifications (optional for MVP endpoints)
- Integrations: WhatsApp provider adapter in Phase 4

## 2) Role and Hierarchy Model

## 2.1 Canonical roles

- `ceo`
- `centre_head`
- `coordinator`
- `supervisor`
- `executor`

## 2.2 Executor kinds

- `therapist`
- `doctor`
- `reception`
- `marketing`
- `support`
- `security`

## 2.3 Legacy mapping (for migration)

- `admin -> ceo`
- `manager -> centre_head`
- `user -> executor`

## 3) Data Model (MongoDB Collections)

## 3.1 `users`

```json
{
  "_id": "ObjectId",
  "name": "string",
  "email": "string (unique, lowercase)",
  "phone": "string",
  "passwordHash": "string",
  "role": "ceo|centre_head|coordinator|supervisor|executor",
  "executorKind": "therapist|doctor|reception|marketing|support|security|''",
  "departmentPrimary": "ObjectId(departments)",
  "centerId": "ObjectId(centers)",
  "reportsTo": "ObjectId(users)|null",
  "permissions": ["string"],
  "active": "boolean",
  "deactivatedAt": "Date|null",
  "deactivatedReason": "string",
  "lastAccessAt": "Date|null",
  "avatarUrl": "string",
  "title": "string",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

Indexes:
- `email` unique
- `role + active`
- `centerId + role`
- `reportsTo`

## 3.2 `centers`

```json
{
  "_id": "ObjectId",
  "name": "Ludhiana|Moga|Jalandhar|Faridkot|Malerkotla|custom",
  "code": "string (unique)",
  "active": "boolean",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

Indexes:
- `code` unique
- `name` unique

## 3.3 `departments`

```json
{
  "_id": "ObjectId",
  "name": "Marketing|Reception|Operations|Clinical|Admin|Management|custom",
  "code": "string (unique)",
  "active": "boolean",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

Indexes:
- `code` unique
- `name` unique

## 3.4 `task_templates` (optional but recommended)

Used to standardize recurring SOP-style tasks with required input schemas.

```json
{
  "_id": "ObjectId",
  "title": "string",
  "description": "string",
  "departmentId": "ObjectId(departments)",
  "functionTag": "string",
  "priorityDefault": "low|normal|high|urgent",
  "recurringTypeDefault": "one_time|daily|weekly|monthly|custom",
  "requiredInputsSchema": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "active": "boolean",
  "createdBy": "ObjectId(users)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## 3.5 `tasks`

```json
{
  "_id": "ObjectId",
  "taskIdDisplay": "number|string",
  "title": "string",
  "description": "string",
  "departmentId": "ObjectId(departments) [mandatory]",
  "functionTag": "string [mandatory]",
  "centerId": "ObjectId(centers) [mandatory]",
  "assignedTo": ["ObjectId(users)"],
  "assignedBy": "ObjectId(users)",
  "priority": "low|normal|high|urgent",
  "dueDate": "Date",
  "recurringType": "one_time|daily|weekly|monthly|custom",
  "recurrence": {
    "interval": "number",
    "daysOfWeek": ["number"],
    "endDate": "Date|null",
    "forever": "boolean"
  },
  "requiredInputsSchema": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "inputPayload": {},
  "inputCompletionPercent": "number",
  "requiresApproval": "boolean",
  "approvalStatus": "none|pending|approved|rejected",
  "status": "pending|in_progress|awaiting_approval|completed|overdue|cancelled",
  "rejectionMode": "no_action|reassign|''",
  "rejectionRemarks": "string",
  "completedAt": "Date|null",
  "deletedAt": "Date|null",
  "tags": ["string"],
  "attachments": [
    {
      "name": "string",
      "url": "string",
      "size": "number",
      "mimeType": "string"
    }
  ],
  "voiceNoteUrl": "string",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

Indexes:
- `status + dueDate`
- `departmentId + status`
- `centerId + status`
- `assignedTo + status`
- `approvalStatus + status`
- `deletedAt`

## 3.6 `task_events` (audit trail)

```json
{
  "_id": "ObjectId",
  "taskId": "ObjectId(tasks)",
  "actorId": "ObjectId(users)",
  "eventType": "created|updated|assigned|submitted|approved|rejected|escalated|completed|deleted|restored",
  "meta": {},
  "createdAt": "Date"
}
```

## 3.7 `daily_reports`

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId(users)",
  "reportDate": "YYYY-MM-DD",
  "departmentsWorked": ["ObjectId(departments)"],
  "completedTaskIds": ["ObjectId(tasks)"],
  "pendingTaskIds": ["ObjectId(tasks)"],
  "issues": ["string"],
  "completionPercent": "number",
  "submittedAt": "Date",
  "source": "app|whatsapp_link",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

Indexes:
- `userId + reportDate` unique
- `reportDate`

## 3.8 `escalations`

```json
{
  "_id": "ObjectId",
  "taskId": "ObjectId(tasks)",
  "level": "supervisor|coordinator|centre_head|ceo",
  "triggerReason": "overdue|repeated_delay|non_reporting",
  "status": "open|resolved",
  "notifiedUsers": ["ObjectId(users)"],
  "resolvedBy": "ObjectId(users)|null",
  "resolvedAt": "Date|null",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## 3.9 `notifications`

Reuse existing structure, ensure support for escalation and report reminder types.

## 4) Validation Rules (Backend)

- Reject task create/update when `departmentId` missing.
- Reject task create/update when `functionTag` missing.
- Reject completion if required schema fields are missing in `inputPayload`.
- Enforce hierarchy assignment: actor cannot assign roles above their rank.
- Enforce reporting manager compatibility:
  - Executor -> Supervisor
  - Supervisor -> Coordinator
  - Coordinator -> Centre Head
  - Centre Head -> CEO
- `ceo`-only endpoints for approval/rejection and high-impact admin actions.

## 5) API Contract (v1)

Base: `/api`

Auth header:

`Authorization: Bearer <jwt>`

## 5.1 Auth APIs

### POST `/auth/register`
- Purpose: self-registration as `executor`
- Body:
```json
{ "name": "string", "email": "string", "password": "string", "department": "string(optional)" }
```
- Response: `{ "token": "string", "user": { ... } }`

### POST `/auth/login`
- Body: `{ "email": "string", "password": "string" }`
- Response: `{ "token": "string", "user": { ... } }`

### GET `/auth/me`
- Response: `{ "user": { ... } }`

## 5.2 Master Data APIs

### GET `/centers`
### POST `/centers` (management only)
### PATCH `/centers/:id` (management only)

### GET `/departments`
### POST `/departments` (management only)
### PATCH `/departments/:id` (management only)

## 5.3 User APIs

### GET `/users`
- Query: `search`, `role`, `department`, `centerId`, `status`

### POST `/users` (management)
- Body includes role, center, reporting manager, optional executorKind

### PATCH `/users/:id` (management)

### POST `/users/:id/reset-password` (`ceo`, `centre_head`)

## 5.4 Task APIs

### GET `/tasks`
- Query:
  - `search`
  - `status`
  - `priority`
  - `departmentId`
  - `centerId`
  - `taskType`
  - `approval=true`
  - `myTasks=true`
  - `trash=only`

### GET `/tasks/:id`

### POST `/tasks` (management)
- Required: `title`, `departmentId`, `functionTag`, `centerId`, `assignedTo`, `dueDate`

### PATCH `/tasks/:id`

### POST `/tasks/:id/submit`
- Moves to `awaiting_approval` if required

### POST `/tasks/:id/approve` (`ceo`)

### POST `/tasks/:id/reject` (`ceo`)
- Body:
```json
{ "mode": "no_action|reassign", "remarks": "string (required)" }
```

### POST `/tasks/:id/complete`
- Requires valid required-input payload

### POST `/tasks/bulk`
- Actions: `delete`, `restore`, `hard_delete`, status updates

## 5.5 Task Template APIs

### GET `/task-templates`
### POST `/task-templates` (management)
### PATCH `/task-templates/:id` (management)

## 5.6 Dashboard APIs

### GET `/dashboard/summary`
- Query: `scope=month|all`, optional `centerId`, `departmentId`

### GET `/dashboard/team-performance`

### GET `/dashboard/activity`

### GET `/dashboard/escalations`

## 5.7 Report APIs

### POST `/reports/daily`
- One submission per user per day

### GET `/reports/daily`
- Filter by date range, center, department, role

### GET `/reports/ceo-summary?date=YYYY-MM-DD`

## 5.8 WhatsApp APIs (Phase 4)

### POST `/integrations/whatsapp/send-daily-reminders`
### POST `/integrations/whatsapp/webhook` (provider callback)
### POST `/integrations/whatsapp/send-ceo-summary`

## 6) Workflow State Machine (Task)

- `pending -> in_progress -> awaiting_approval -> completed`
- `awaiting_approval -> rejected`
- `rejected + reassign -> pending`
- `rejected + no_action -> cancelled`
- `any non-terminal overdue by scheduler -> overdue`

Terminal statuses:
- `completed`
- `cancelled`

## 7) Escalation Job Specification

Run scheduler every 15 minutes:

1. Find tasks with:
   - `status in (pending, in_progress, awaiting_approval, overdue)`
   - `dueDate < now`
2. Mark overdue where needed
3. Escalation tier by elapsed overdue:
   - `>0h`: Supervisor
   - `>24h`: Coordinator
   - `>48h`: Centre Head
   - `>72h`: CEO
4. Create/update escalation record
5. Notify escalation recipients

## 8) Required Input Validation Contract

At completion time:

1. Read task `requiredInputsSchema`
2. Validate `inputPayload` against schema
3. On failure:
```json
{
  "message": "Required inputs missing",
  "errors": [
    { "field": "doctorName", "issue": "required" }
  ]
}
```

## 9) Access Control Matrix (Condensed)

- CEO: full control across centers/departments
- Centre Head: full center management, limited global controls
- Coordinator: team and department operations
- Supervisor: team execution oversight
- Executor: own-task execution and reporting only

## 10) Non-Functional Requirements

- API response p95 < 500ms for common list endpoints
- Audit trail for all sensitive actions
- Soft delete by default for business records
- Pagination mandatory for list endpoints
- UTC storage for all timestamps
- OWASP baseline (rate limits, input sanitization, JWT expiry, password policy)

## 11) Test Acceptance Checklist

- Role migration works for old users
- Hierarchy-based visibility enforced server-side
- Cannot complete tasks with missing required inputs
- Escalation triggers and notifications are correct by delay tier
- Daily report one-per-day enforcement works
- CEO dashboard aggregates center and department data correctly

## 12) Implementation Order (Engineering)

1. Master data: centers, departments
2. User model updates + migration + hierarchy checks
3. Task schema (`departmentId`, `functionTag`, required input schema/payload)
4. Completion validator + rejection/approval workflow
5. Dashboard/report filters by role + center + department
6. Escalation scheduler + notification types
7. WhatsApp automation adapter

