import { Department } from "../models/Department.js";
import { isAllowedDepartmentCode } from "../constants/departments.js";

export async function assertAllowedDepartmentId(departmentId) {
  if (!departmentId) return { ok: false, message: "Department is required" };
  const dept = await Department.findById(departmentId).select("code").lean();
  if (!dept || !isAllowedDepartmentCode(dept.code)) {
    return { ok: false, message: "Invalid or disallowed department" };
  }
  return { ok: true };
}
