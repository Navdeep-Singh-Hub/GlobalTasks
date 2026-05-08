import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCenterName(name: string) {
  return String(name || "").trim().toLowerCase() === "mohali" ? "Barnala" : name;
}
