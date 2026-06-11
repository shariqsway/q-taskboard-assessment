import type { ActivityType, TaskStatus } from "@prisma/client";

export type StatusChangedMetadata = {
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
};

export type AssigneeChangedMetadata = {
  fromAssigneeId: string | null;
  toAssigneeId: string | null;
  fromAssigneeName: string | null;
  toAssigneeName: string | null;
};

export type ActivityMetadata = StatusChangedMetadata | AssigneeChangedMetadata;

export type TaskSnapshot = {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  assigneeId: string | null;
};

export type ActivityInput = {
  projectId: string;
  taskId: string;
  actorId: string;
  type: ActivityType;
  taskTitle: string;
  metadata?: ActivityMetadata;
};

export type ApiActivity = {
  id: string;
  type: ActivityType;
  taskId: string;
  taskTitle: string;
  metadata: ActivityMetadata | null;
  createdAt: string;
  actor: { id: string; name: string; email: string };
};
