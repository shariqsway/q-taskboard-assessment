import type { TaskStatus } from "@prisma/client";
import type {
  ActivityInput,
  ActivityMetadata,
  AssigneeChangedMetadata,
  StatusChangedMetadata,
  TaskSnapshot,
} from "./types";

type AssigneeInfo = { id: string; name: string } | null;

export function buildTaskUpdateActivities(
  before: TaskSnapshot,
  after: TaskSnapshot,
  actorId: string,
  assigneeBefore: AssigneeInfo,
  assigneeAfter: AssigneeInfo,
): ActivityInput[] {
  const activities: ActivityInput[] = [];

  if (before.status !== after.status) {
    const metadata: StatusChangedMetadata = {
      fromStatus: before.status,
      toStatus: after.status,
    };
    activities.push({
      projectId: after.projectId,
      taskId: after.id,
      actorId,
      type: "status_changed",
      taskTitle: after.title,
      metadata,
    });
  }

  if (before.assigneeId !== after.assigneeId) {
    const metadata: AssigneeChangedMetadata = {
      fromAssigneeId: before.assigneeId,
      toAssigneeId: after.assigneeId,
      fromAssigneeName: assigneeBefore?.name ?? null,
      toAssigneeName: assigneeAfter?.name ?? null,
    };
    activities.push({
      projectId: after.projectId,
      taskId: after.id,
      actorId,
      type: "assignee_changed",
      taskTitle: after.title,
      metadata,
    });
  }

  return activities;
}

export function buildTaskCreatedActivity(
  task: TaskSnapshot,
  actorId: string,
): ActivityInput {
  return {
    projectId: task.projectId,
    taskId: task.id,
    actorId,
    type: "task_created",
    taskTitle: task.title,
  };
}

export function isStatusMetadata(
  metadata: ActivityMetadata | null | undefined,
): metadata is StatusChangedMetadata {
  return metadata != null && "fromStatus" in metadata && "toStatus" in metadata;
}

export function isAssigneeMetadata(
  metadata: ActivityMetadata | null | undefined,
): metadata is AssigneeChangedMetadata {
  return metadata != null && "fromAssigneeId" in metadata && "toAssigneeId" in metadata;
}

export function formatActivityMessage(
  type: ActivityInput["type"],
  actorName: string,
  taskTitle: string,
  metadata: ActivityMetadata | null | undefined,
  statusLabels: Record<TaskStatus, string>,
): string {
  switch (type) {
    case "task_created":
      return `${actorName} created "${taskTitle}"`;
    case "status_changed":
      if (isStatusMetadata(metadata)) {
        return `${actorName} moved "${taskTitle}" from ${statusLabels[metadata.fromStatus]} to ${statusLabels[metadata.toStatus]}`;
      }
      return `${actorName} changed status on "${taskTitle}"`;
    case "assignee_changed":
      if (isAssigneeMetadata(metadata)) {
        const from = metadata.fromAssigneeName ?? "unassigned";
        const to = metadata.toAssigneeName ?? "unassigned";
        return `${actorName} reassigned "${taskTitle}" from ${from} to ${to}`;
      }
      return `${actorName} changed assignee on "${taskTitle}"`;
    default:
      return `${actorName} updated "${taskTitle}"`;
  }
}
