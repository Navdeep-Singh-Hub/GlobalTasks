/** Parse coordinator sheet `remarks` JSON saved by the daily coordinator sheet. */

export type RoundsPlanRowParsed = {
  id: string;
  name: string;
  time: string;
  roomNo: string;
  child: string;
  activity: string;
};

export type SessionObservationRowParsed = {
  id: string;
  childName: string;
  therapistName: string;
  rating: number | "";
};

function newSessionObservationRowParsed(): SessionObservationRowParsed {
  return {
    id: `so-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    childName: "",
    therapistName: "",
    rating: "",
  };
}

function newRoundsPlanRowParsed(): RoundsPlanRowParsed {
  return {
    id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    time: "",
    roomNo: "",
    child: "",
    activity: "",
  };
}

export function parseParentMeetingRemarks(raw: string): { children: string[]; note: string } {
  if (!String(raw || "").trim()) return { children: [], note: "" };
  try {
    const p = JSON.parse(raw) as { children?: unknown; remarks?: unknown };
    if (p && typeof p === "object") {
      const arr = Array.isArray(p.children) ? p.children.map((x) => String(x ?? "").trim()) : [];
      return { children: arr, note: String(p.remarks ?? "").trim() };
    }
  } catch {
    return { children: [], note: String(raw).trim() };
  }
  return { children: [], note: "" };
}

export function parseSessionObservationRemarks(raw: string): { note: string; rows: SessionObservationRowParsed[] } {
  const fallback = { note: "", rows: [newSessionObservationRowParsed()] };
  if (!String(raw || "").trim()) return fallback;
  try {
    const p = JSON.parse(raw) as {
      remarks?: unknown;
      observationRows?: { childName?: unknown; therapistName?: unknown; rating?: unknown }[];
      children?: unknown;
    };
    if (!p || typeof p !== "object") return fallback;
    const note = String(p.remarks ?? "").trim();
    if (Array.isArray(p.observationRows) && p.observationRows.length) {
      const rows = p.observationRows.map((r, i) => {
        const rt = r?.rating;
        let rating: number | "" = "";
        if (typeof rt === "number" && rt >= 1 && rt <= 10 && Number.isInteger(rt)) rating = rt;
        else if (typeof rt === "string") {
          const n = Number.parseInt(rt, 10);
          if (n >= 1 && n <= 10) rating = n;
        }
        return {
          id: `so-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          childName: String(r?.childName ?? ""),
          therapistName: String(r?.therapistName ?? ""),
          rating,
        };
      });
      return { note, rows };
    }
    const legacy = parseParentMeetingRemarks(raw);
    if (legacy.children.length) {
      const rows = legacy.children.map((name, i) => ({
        id: `so-legacy-${i}-${name.slice(0, 8)}`,
        childName: name,
        therapistName: "",
        rating: "" as const,
      }));
      return { note: legacy.note, rows };
    }
    return { note, rows: [newSessionObservationRowParsed()] };
  } catch {
    return { note: String(raw).trim(), rows: [newSessionObservationRowParsed()] };
  }
}

export function parseRoundsOfCentreRemarks(raw: string): { note: string; rows: RoundsPlanRowParsed[] } {
  if (!String(raw || "").trim()) return { note: "", rows: [newRoundsPlanRowParsed()] };
  try {
    const p = JSON.parse(raw) as {
      remarks?: string;
      therapyPlanRows?: { name?: string; time?: string; roomNo?: string; child?: string; activity?: string }[];
    };
    if (p && typeof p === "object") {
      const rows = Array.isArray(p.therapyPlanRows)
        ? p.therapyPlanRows.map((r, i) => ({
            id: `rc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            name: String(r?.name || ""),
            time: String(r?.time || ""),
            roomNo: String(r?.roomNo || ""),
            child: String(r?.child || ""),
            activity: String(r?.activity || ""),
          }))
        : [];
      return {
        note: String(p.remarks ?? "").trim(),
        rows: rows.length ? rows : [newRoundsPlanRowParsed()],
      };
    }
  } catch {
    return { note: String(raw).trim(), rows: [newRoundsPlanRowParsed()] };
  }
  return { note: "", rows: [newRoundsPlanRowParsed()] };
}
