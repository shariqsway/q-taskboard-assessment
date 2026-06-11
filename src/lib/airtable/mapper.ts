import type { AirtableFieldMap, ExportTaskInput } from "./types";

export const TASKBOARD_ID_FIELD = "TaskBoard Task ID";

export function taskToAirtableFields(
  task: ExportTaskInput,
  projectName: string,
  syncedAt: Date,
): AirtableFieldMap {
  return {
    [TASKBOARD_ID_FIELD]: task.id,
    Title: task.title,
    Description: task.description,
    Status: task.status,
    "Project ID": task.projectId,
    "Project Name": projectName,
    "Assignee Email": task.assignee?.email ?? null,
    "Assignee Name": task.assignee?.name ?? null,
    Position: task.position,
    "Created At": task.createdAt.toISOString(),
    "Updated At": task.updatedAt.toISOString(),
    "Last Synced At": syncedAt.toISOString(),
  };
}
