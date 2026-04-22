export type Summary = {
  cards: { totalTasks: number; pending: number; completed: number; overdue: number; activeProjects: number; overduePct: number };
  byStatus: { name: string; value: number }[];
  byCadence: { _id: string; total: number; pending: number; completed: number }[];
  deliveryCurve: { label: string; planned: number; completed: number }[];
};

export type TeamMember = {
  user: { _id: string; name: string; email: string; role: string; executorKind?: string };
  total: number;
  pending: number;
  overdue: number;
  completed: number;
  completion: number;
  oneTime: number;
  daily: number;
  recurring: number;
};

export type ActivityItem = { _id: string; actorName?: string; message: string; taskTitle?: string; taskType?: string; createdAt: string };
export type IndividualReport = { userId: string; completed: number; pending: number; overdue: number; total: number; completionPercent: number };
export type SupervisorReport = { supervisorId: string; teamCount: number; total: number; completed: number; pending: number; overdue: number };
export type CoordinatorReport = { coordinatorId: string; supervisors: number; executors: number; byDepartment: { _id: string; total: number; completed: number; overdue: number }[] };
export type CentreHeadReport = { centreHeadId: string; summary: { _id: string; total: number; completed: number; pending: number; overdue: number }[] };
export type CioSummary = {
  totals: { total: number; completed: number; pending: number; overdue: number };
  byCenter: { _id: string; total: number; completed: number }[];
  byDepartment: { _id: string; total: number; overdue: number }[];
  nonReporting: { _id: string; name: string; email: string }[];
};
