import { Center } from "../models/Center.js";
import { Department } from "../models/Department.js";

const DEFAULT_CENTERS = [
  { name: "Ludhiana", code: "LDH" },
  { name: "Moga", code: "MOG" },
  { name: "Jalandhar", code: "JAL" },
  { name: "Faridkot", code: "FDK" },
  { name: "Malerkotla", code: "MLK" },
  { name: "Amritsar", code: "ASR" },
  { name: "Patiala", code: "PTA" },
  { name: "Bathinda", code: "BTD" },
  { name: "Mohali", code: "MHL" },
];

const DEFAULT_DEPARTMENTS = [
  { name: "Marketing", code: "MKT" },
  { name: "Reception", code: "REC" },
  { name: "Operations", code: "OPS" },
  { name: "Clinical", code: "CLN" },
  { name: "Admin", code: "ADM" },
  { name: "Management", code: "MGT" },
];

export async function ensureMasterData() {
  for (const c of DEFAULT_CENTERS) {
    // eslint-disable-next-line no-await-in-loop
    await Center.updateOne({ code: c.code }, { $setOnInsert: c }, { upsert: true });
  }
  for (const d of DEFAULT_DEPARTMENTS) {
    // eslint-disable-next-line no-await-in-loop
    await Department.updateOne({ code: d.code }, { $setOnInsert: d }, { upsert: true });
  }
}

