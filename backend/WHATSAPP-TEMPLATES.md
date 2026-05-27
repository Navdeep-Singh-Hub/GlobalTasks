# WhatsApp templates — Meta Business Manager

Create in: **Meta Business Suite → WhatsApp Manager → Message templates**

Names must match `.env` exactly. Language: **English**.

---

## 1. Task assigned — `globaltasks_task_assigned_v1` (required)

Use **10 variables** so each detail appears on its own line (Meta often breaks multi-line `{{2}}`).

| Field | Value |
|--------|--------|
| **Template name** | `globaltasks_task_assigned_v1` |
| **Category** | `UTILITY` |
| **Language** | English |

### Body (copy exactly)

```
Hi {{1}}, new task assigned in GlobalTasks:

From {{2}}
Title: {{3}}
Description: {{4}}
Type: {{5}}
Priority: {{6}}
Due: {{7}}
Department: {{8}}
Center: {{9}}

Open: {{10}}
```

Do **not** add extra lines like “Please complete them on time” in the template — only the body above.

### Sample values for Meta review

| Var | Sample |
|-----|--------|
| {{1}} | `Navdeep Singh` |
| {{2}} | `Ravish Arora` |
| {{3}} | `Stock audit` |
| {{4}} | `Count all SKUs by 5 PM` |
| {{5}} | `One Time` |
| {{6}} | `High` |
| {{7}} | `Sat, 6 Jun, 2026, 12:00 am` |
| {{8}} | `Software` |
| {{9}} | `Ludhiana` |
| {{10}} | `https://tasks.globalsofts.in/pending-single` |

### `.env`

```env
WHATSAPP_TEMPLATE_TASK_ASSIGNED=globaltasks_task_assigned_v1
WHATSAPP_TEMPLATE_LANGUAGE=en
```

### App → variable mapping

| Variable | Backend sends |
|----------|----------------|
| {{1}} | Assignee name |
| {{2}} | Who assigned (name only) |
| {{3}} | Task title |
| {{4}} | Description |
| {{5}} | Task type |
| {{6}} | Priority |
| {{7}} | Due date (formatted) |
| {{8}} | Department |
| {{9}} | Center |
| {{10}} | App link |

If this template is missing or rejected, the app sends a **plain text** message with the same fields on separate lines (no morning digest).

---

## 2. Morning digest — `globaltasks_morning_digest_v1`

**Only for 09:45 daily sheet reminder.** Do not edit this template for task assign.

### Body (keep as-is)

```
Good morning {{1}}. Daily checklist for today:

{{2}}
```

---

## 3. Evening summary — `globaltasks_evening_summary_v1`

```
Daily summary for {{1}}:
Completed today: {{2}}
Pending now: {{3}}
```

---

## Common mistake

If task messages show:

`NEW TASK: From X · Title: Y · Description: Z` on **one line**

you are either using the **wrong template** or an old app build. Fix:

1. Update Meta template to the **10-variable** body above (approve it).
2. Restore morning template to “Good morning…” only.
3. Redeploy backend with latest code (no morning fallback for tasks).

---

## Production `.env`

```env
CLIENT_ORIGIN=https://tasks.globalsofts.in
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_TEMPLATE_TASK_ASSIGNED=globaltasks_task_assigned_v1
```
