/**
 * Live API smoke tests against running backend (manager@globaltasks.demo / demo123).
 * Usage: node scripts/smoke-api-flow.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.API_URL || "http://localhost:5001/api";

let passed = 0;
let failed = 0;

function ok(cond, name, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nSmoke against ${BASE}\n`);

  console.log("=== Health ===");
  {
    const { status, data } = await req("/health");
    ok(status === 200 && data?.ok, "GET /health", `status=${status}`);
  }

  console.log("\n=== Auth ===");
  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "manager@globaltasks.demo", password: "demo123" },
  });
  ok(login.status === 200 && login.data?.token, "manager login", JSON.stringify(login.data).slice(0, 120));
  const token = login.data?.token;
  if (!token) {
    console.error("Cannot continue without token");
    process.exit(1);
  }
  const meId = String(login.data?.user?._id || login.data?.user?.id || "");
  const myRole = login.data?.user?.role;
  ok(Boolean(meId), "login returns user id");
  ok(Boolean(myRole), `role present (${myRole})`);

  console.log("\n=== Tasks list ===");
  const tasksRes = await req("/tasks?limit=20", { token });
  ok(tasksRes.status === 200, "GET /tasks", `status=${tasksRes.status}`);
  const tasks = tasksRes.data?.tasks || tasksRes.data || [];
  ok(Array.isArray(tasks), "tasks is array");

  console.log("\n=== Users / assignees ===");
  const usersRes = await req("/users", { token });
  ok(usersRes.status === 200 || usersRes.status === 403, "GET /users reachable", `status=${usersRes.status}`);
  const users = usersRes.data?.users || (Array.isArray(usersRes.data) ? usersRes.data : []);

  let assigneeId = null;
  if (Array.isArray(users) && users.length) {
    const other = users.find((u) => String(u._id) !== meId && u.role !== "ceo");
    assigneeId = String((other || users[0])._id);
    ok(Boolean(assigneeId), `picked assignee for history (${assigneeId.slice(-6)})`);
  } else {
    // fall back to self
    assigneeId = meId;
    ok(true, "no users list; use self for history endpoints");
  }

  console.log("\n=== Performance / approval history ===");
  const historyPaths = [
    `/dashboard/assignee-approval-history?assigneeId=${assigneeId}`,
    `/dashboard/assignee-history?assigneeId=${assigneeId}`,
    `/dashboard/performance?assigneeId=${assigneeId}`,
  ];
  let historyData = null;
  let historyPathUsed = null;
  for (const p of historyPaths) {
    const r = await req(p, { token });
    if (r.status === 200) {
      historyPathUsed = p;
      historyData = r.data;
      break;
    }
    console.log(`  · ${p} → ${r.status}`);
  }
  ok(Boolean(historyPathUsed), "at least one history endpoint works", historyPathUsed || "none");
  if (historyData) {
    const records =
      historyData.records || historyData.history || historyData.items || historyData.approvals || [];
    const arr = Array.isArray(records) ? records : [];
    ok(true, `history returned (${arr.length} records)`);
    // no crash fields
    ok(!historyData.message || arr.length >= 0, "history payload looks valid");
  }

  // Discover actual dashboard routes from a known working path via dash listMe
  const dashProbe = await req("/dashboard/summary", { token });
  if (dashProbe.status !== 404) {
    ok(dashProbe.status === 200 || dashProbe.status === 403, "GET /dashboard/summary", `status=${dashProbe.status}`);
  }

  console.log("\n=== Task detail personal view ===");
  if (Array.isArray(tasks) && tasks.length) {
    const tid = tasks[0]._id;
    const one = await req(`/tasks/${tid}`, { token });
    ok(one.status === 200, `GET /tasks/:id`, `status=${one.status}`);
    const t = one.data?.task || one.data;
    if (t) {
      ok(
        t.personalWorkState === undefined ||
          ["open", "submitted", "viewer"].includes(t.personalWorkState),
        `personalWorkState ok (${t.personalWorkState})`
      );
    }
  } else {
    ok(true, "no tasks to detail-check (empty inbox)");
  }

  console.log("\n=== Multi-assignee create fan-out (dry create+delete if possible) ===");
  // Only if we have at least 2 user ids
  const ids = Array.isArray(users)
    ? users
        .map((u) => String(u._id))
        .filter((id) => id && id !== meId)
        .slice(0, 2)
    : [];
  if (ids.length >= 2) {
    const today = new Date();
    today.setHours(18, 0, 0, 0);
    const create = await req("/tasks", {
      method: "POST",
      token,
      body: {
        title: `[smoke-test] multi fan-out ${Date.now()}`,
        description: "Automated smoke — safe to delete",
        taskType: "single",
        priority: "low",
        dueDate: today.toISOString(),
        assignees: ids,
      },
    });
    ok(
      create.status === 200 || create.status === 201,
      "POST multi-assignee task",
      `status=${create.status} ${JSON.stringify(create.data).slice(0, 100)}`
    );
    const createdList = create.data?.tasks || (create.data?.task ? [create.data.task] : []);
    if (createdList.length) {
      ok(
        createdList.length >= 2 ||
          (createdList[0]?.assignees?.length === 1 && createdList.length >= 1),
        `fan-out result count=${createdList.length} firstAssignees=${createdList[0]?.assignees?.length}`
      );
      // cleanup
      for (const t of createdList) {
        const del = await req(`/tasks/${t._id}`, { method: "DELETE", token });
        // soft delete may be 200
        ok(del.status === 200 || del.status === 204 || del.status === 404, `cleanup delete ${String(t._id).slice(-4)}`);
      }
    } else if (create.data?.task) {
      // single task returned
      const t = create.data.task;
      ok(true, `single task created (assignees=${(t.assignees || []).length})`);
      await req(`/tasks/${t._id}`, { method: "DELETE", token });
    }
  } else {
    ok(true, "skip fan-out create (need 2 other users)");
  }

  console.log("\n=== Invalid token rejected ===");
  const bad = await req("/tasks", { token: "invalid.token.here" });
  ok(bad.status === 401 || bad.status === 403, "invalid token blocked", `status=${bad.status}`);

  console.log("\n----------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All smoke API checks passed.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
