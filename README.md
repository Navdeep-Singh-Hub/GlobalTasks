# GlobalTasks — Task Management System

A full-stack TMS inspired by Finamite — built for admins who run teams on a **mix of one-time and recurring work** (daily / weekly / fortnightly / monthly / quarterly / yearly).

- **Single** = tasks that happen once.
- **Recurring** = tasks that auto-repeat on a cadence, optionally forever, with a configurable week-off.

## Stack

- **Frontend:** Next.js 14 (App Router) · Tailwind CSS · Recharts · Framer Motion · Lucide icons
- **Backend:** Node.js · Express · MongoDB (Mongoose) · JWT auth · Socket.IO (real-time notifications) · PDFKit (exports)

## Features

- Full admin **Dashboard**: command-center welcome, KPI cards (Total / Pending / Completed / Overdue), delivery curve (6-month planned vs completed), status donut, workload-by-cadence grid, team performance focus and pending-work-by-member panels, latest activity feed.
- **Assign Task** flow: multi-draft creator with task type (One Time → Yearly), multi-assignee select, admin-approval flag, voice note recording, attachments, date config with "forever" & "include Sunday" options.
- **Master Single / Master Recurring** views: filters, cards/table toggles, bulk actions (complete, bin), attachments column, admin-wide "All Team" scope.
- **Pending Single / Pending Recurring** variants pre-filtered on `status=pending`.
- **For Approval** queue for manager/admin sign-off.
- **Task Shift** for bulk reassignment.
- **Recycle bin** with restore / hard delete.
- **Performance** analytics (stacked bars + per-member scorecards).
- **Admin Panel** — user table with search, role/department/status filters, inline role switcher, toggle active, reset password, permissions editor, last access info.
- **Integrations**, **Chat Support** (simulated concierge), **Help & Support**.
- Collapsible brand-gradient sidebar, notification bell with polling (every 10s), theme toggle, role-aware navigation.

## Project layout

```
backend/                Express API + Mongoose models + Socket.IO
  src/
    models/             User, Task, Project, Notification, Activity
    routes/             auth, users, tasks, projects, notifications, dashboard, reports
    services/           activityService, notificationService
    middleware/auth.js
    realtime/socket.js
    seed.js
frontend/               Next.js App Router
  app/(auth)/           login, register
  app/(app)/            dashboard, assign-task, pending-single, pending-recurring,
                        master-single, master-recurring, for-approval, task-shift,
                        chat-support, recycle-bin, performance, integrations,
                        admin, settings, help
  components/
    dashboard/          kpi-card, delivery-curve, status-donut, cadence-grid, team-*, activity-feed
    tasks/              assign-task-form, tasks-view
    layout/             app-shell, app-sidebar, theme-toggle
    ui/                 button, input, card, badge, modal, spinner
```

## Setup

### Prerequisites
- Node 18+
- MongoDB (Atlas connection string provided in `backend/.env`, or run locally)

### Backend

```bash
cd backend
npm install
# copy env template if needed:
# cp .env.example .env
npm run seed     # wipes + reseeds demo data
npm run dev      # starts API on http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # starts UI on http://localhost:3000
```

The UI reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:5000/api`).

## Demo accounts (password `demo123`)

| Role    | Email                         | Who              |
| ------- | ----------------------------- | ---------------- |
| Admin   | admin@globaltasks.demo        | Ravish Arora     |
| Manager | manager@globaltasks.demo      | sandeep singh    |
| User    | user@globaltasks.demo         | jatinder dubey   |

## API map (all prefixed with `/api`)

| Group           | Endpoint                       | Notes |
| --------------- | ------------------------------ | ----- |
| `auth`          | `POST /register`, `POST /login`, `GET /me` | JWT bearer |
| `users`         | `GET /`, `GET /departments`, `POST /`, `PATCH /:id`, `POST /:id/reset-password` | Admin/manager |
| `tasks`         | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /bulk`, `POST /:id/approve`, `POST /:id/reject`, `DELETE /:id`, `POST /:id/restore`, `DELETE /:id/hard`, `GET /meta` | Full CRUD + recurrence |
| `projects`      | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` | Optional grouping |
| `notifications` | `GET /`, `POST /:id/read`, `POST /read-all` | Polled by header |
| `dashboard`     | `GET /summary`, `GET /team-performance`, `GET /activity`, `GET /search` | Used on Dashboard |
| `reports`       | `GET /summary`, `GET /export?format=csv|pdf` | Export ready |
