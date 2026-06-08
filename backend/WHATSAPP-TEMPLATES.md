# WhatsApp templates — Meta Business Manager

Create in: **Meta Business Suite → WhatsApp Manager → Message templates**

Names must match `.env` exactly. Language: **English**.

---

## 1. Morning digest + task assign — `globaltasks_morning_digest_v1` (required)

Used for **both**:
- 09:45 daily supervisor/coordinator sheet reminder
- **Instant WhatsApp when someone assigns a task** to an assignee

| Field | Value |
|--------|--------|
| **Template name** | `globaltasks_morning_digest_v1` |
| **Category** | `UTILITY` |
| **Language** | English |

### Body (copy exactly)

```
Good morning {{1}}. Daily checklist for today:

{{2}}
```

### Sample values for Meta review

| Var | Sample (morning digest) | Sample (task assign) |
|-----|-------------------------|----------------------|
| {{1}} | `Navdeep Singh` | `Navdeep Singh` |
| {{2}} | `1. Fill Daily Supervisor Sheet (daily)` | `1. Stock audit (One Time)\n   Due: Sat, 6 Jun, 2026, 5:00 pm\n   Description: Count all SKUs\n   Assigned by: Ravish Arora\n   Open: https://tasks.globalsofts.in/pending-single` |

### `.env`

```env
WHATSAPP_TEMPLATE_MORNING=globaltasks_morning_digest_v1
WHATSAPP_TEMPLATE_LANGUAGE=en
```

Task assign sends {{2}} as a numbered list with title, type, due date, description, assigner, and app link.

---

## 2. Legacy task template — `globaltasks_task_assigned_v1` (optional, not used by default)

The app no longer uses this for assign if `WHATSAPP_TEMPLATE_MORNING` is set. Keep only if you maintain a separate 10-variable template.

### Body (legacy)

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

---

## 3. Evening summary — `globaltasks_evening_summary_v1`

```
Daily summary for {{1}}:
Completed today: {{2}}
Pending now: {{3}}
```

---

## Production `.env`

```env
CLIENT_ORIGIN=https://tasks.globalsofts.in
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_TEMPLATE_MORNING=globaltasks_morning_digest_v1
```
