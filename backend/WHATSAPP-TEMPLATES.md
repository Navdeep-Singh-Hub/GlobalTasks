# WhatsApp templates (Meta Business Manager)

Create these in **WhatsApp Manager → Message templates**.  
Template **name** must match `.env` exactly. Language: **English** (`en`).

After approval, set in `backend/.env`:

```env
WHATSAPP_TEMPLATE_MORNING=globaltasks_morning_digest_v1
WHATSAPP_TEMPLATE_LANGUAGE=en
```

---

## 1. Morning digest — `globaltasks_morning_digest_v1`

**Category:** `UTILITY`  
**Language:** English  

### Body (copy into Meta; keep `{{1}}` and `{{2}}` as variables)

```
Good morning {{1}}. Daily checklist for today:

{{2}}
```

### Variable mapping (what the app sends)

| Variable | Content | Example |
|----------|---------|---------|
| `{{1}}` | User name | `Priya` |
| `{{2}}` | Numbered daily sheet lines | `1. Fill Daily Supervisor Sheet (daily)` |

### Sample values for Meta review (optional)

- **{{1}}:** `Rahul`
- **{{2}}:**
  ```
  1. Fill Daily Supervisor Sheet (daily)
  ```

### Plain-text preview (if template not approved yet, app sends this automatically)

```
Good morning Rahul. Daily checklist for today:
1. Fill Daily Supervisor Sheet (daily)
```

**Who receives it:** active users with role `supervisor` or `coordinator` and valid phone.  
**Who does not:** other roles (they get task WhatsApp on assign, not this morning list).

---

## 2. Evening summary — `globaltasks_evening_summary_v1` (for later)

**Category:** `UTILITY`  

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

`.env`: `WHATSAPP_TEMPLATE_EVENING=globaltasks_evening_summary_v1`

---

## 3. Task assigned (optional — app uses plain text today)

Meta templates are short; full task description is sent as **session text** after assign, not as this template.  
If you later want a short template + link, use a separate name and we can wire `WHATSAPP_TEMPLATE_TASK_ASSIGNED`.

Suggested short template name: `globaltasks_task_assigned_v1`

```
Hi {{1}}, new task from {{2}}: {{3}}. Open GlobalTasks to view full details.
```

| Variable | Example |
|----------|---------|
| `{{1}}` | Assignee name |
| `{{2}}` | Assigner name |
| `{{3}}` | Task title (max ~100 chars in practice) |

---

## Meta tips

1. Avoid promotional language in `UTILITY` templates.
2. Variable `{{2}}` in morning template can be multiple lines — keep under ~900 characters.
3. Template name in Meta must be **lowercase with underscores**, same as `.env`.
4. Until approved, set `WHATSAPP_TEMPLATE_MORNING=` empty to force plain-text fallback for testing.
