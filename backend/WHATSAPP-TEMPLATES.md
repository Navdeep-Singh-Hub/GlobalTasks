# WhatsApp templates — Meta Business Manager

Create in: **Meta Business Suite → WhatsApp Manager → Message templates → Create template**

Names must match `.env` **exactly** (lowercase, underscores). Language: **English**.

---

## 1. Task assigned — `globaltasks_task_assigned_v1` (ADD THIS)

Required for instant task WhatsApp when the user has not chatted in the last 24 hours.

| Field | Value |
|--------|--------|
| **Template name** | `globaltasks_task_assigned_v1` |
| **Category** | `UTILITY` |
| **Language** | English |

### Body (copy exactly — 2 variables)

```
Hi {{1}}, new task assigned in GlobalTasks:

{{2}}
```

### Footer (optional)

```
Global Wellness — Task app
```

### Sample values (Meta review form)

| Variable | Sample |
|----------|--------|
| **{{1}}** | `Manjot` |
| **{{2}}** | Paste as multiple lines (one detail per line): |

```
From Sandeep Singh
Title: Stock audit ward 2
Description: Count all SKUs and update sheet by 5 PM
Type: One Time
Priority: High
Due: Mon, 26 May 2026, 5:00 pm
Center: Ludhiana
Open: https://tasks.globalsofts.in/pending-single
```

### `.env`

```env
WHATSAPP_TEMPLATE_TASK_ASSIGNED=globaltasks_task_assigned_v1
WHATSAPP_TEMPLATE_LANGUAGE=en
```

### App mapping

| Variable | Sent by backend |
|----------|-----------------|
| `{{1}}` | Assignee name |
| `{{2}}` | Multiple lines — one field per line: From…, Title…, Description…, Type…, Priority…, Due…, Center…, Open… |

**Until this template is approved**, the app uses **`globaltasks_morning_digest_v1`** with a single-line summary (that template does not support multi-line `{{2}}`), then plain text with full multi-line details.

**Important:** Create `globaltasks_task_assigned_v1` with the body below so `{{2}}` can show each field on its own line. Do not reuse the morning template for task details.

---

## 2. Morning digest — `globaltasks_morning_digest_v1` (already live)

| Field | Value |
|--------|--------|
| **Category** | `UTILITY` |

### Body

```
Good morning {{1}}. Daily checklist for today:

{{2}}
```

| Variable | Example |
|----------|---------|
| `{{1}}` | `Rahul` |
| `{{2}}** | `1. Fill Daily Supervisor Sheet (daily)` |

---

## 3. Evening summary — `globaltasks_evening_summary_v1` (already live)

### Body

```
Daily summary for {{1}}:
Completed today: {{2}}
Pending now: {{3}}
```

| Variable | Example |
|----------|---------|
| `{{1}}` | `Rahul` |
| `{{2}}` | `3` |
| `{{3}}` | `5` |

---

## Render / production checklist

Set in Render → Environment (same as local `.env`):

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_TEMPLATE_TASK_ASSIGNED=globaltasks_task_assigned_v1`
- `WHATSAPP_TEMPLATE_MORNING=globaltasks_morning_digest_v1`
- `WHATSAPP_TEMPLATE_EVENING=globaltasks_evening_summary_v1`
- `CLIENT_ORIGIN=https://tasks.globalsofts.in`

Startup log must show: `mode=live` (not `stub`).

---

## Test from terminal

```bash
cd backend
node scripts/whatsapp-full-test.mjs manjot
```

Or API (CEO login):

```http
POST /api/integrations/whatsapp/test-task-assigned
Authorization: Bearer <token>
Content-Type: application/json

{ "phone": "8569049090" }
```

---

## If user still does not see the message

1. Confirm number is on WhatsApp: `8569049090` → `91 85690 49090`
2. Check **Updates** tab in WhatsApp (business messages often land there)
3. Ask them to save **+91 81465 77145** (Global Wellness) and send `Hi` once
4. Confirm Render logs show `sent (task|morning_fallback|text)` not `stub`
