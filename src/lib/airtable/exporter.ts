import { taskToAirtableFields } from "./mapper";
import { withRetry } from "./retry";
import type {
  AirtableTableClient,
  ExportReport,
  ExportTaskInput,
  TaskExportOutcome,
} from "./types";

export type SyncRecord = {
  airtableRecordId: string;
};

export type ExportProjectTasksOptions = {
  projectId: string;
  projectName: string;
  tasks: ExportTaskInput[];
  syncByTaskId: Map<string, SyncRecord>;
  client: AirtableTableClient;
  onSuccess: (taskId: string, airtableRecordId: string, syncedAt: Date) => Promise<void>;
  onFailure: (taskId: string, error: string) => Promise<void>;
};

export async function exportProjectTasks(options: ExportProjectTasksOptions): Promise<ExportReport> {
  const { projectId, projectName, tasks, syncByTaskId, client, onSuccess, onFailure } = options;
  const syncedAt = new Date();
  const results: TaskExportOutcome[] = [];

  for (const task of tasks) {
    try {
      const fields = taskToAirtableFields(task, projectName, syncedAt);
      const existingSync = syncByTaskId.get(task.id);
      let recordId = existingSync?.airtableRecordId;

      if (!recordId) {
        try {
          const found = await withRetry(() => client.findByTaskBoardId(task.id));
          if (found) recordId = found.id;
        } catch {
          // Lookup is best-effort; proceed to create when filter field is missing or query fails.
        }
      }

      let outcome: TaskExportOutcome;
      if (recordId) {
        const updated = await withRetry(() => client.updateRecord(recordId!, fields));
        outcome = { taskId: task.id, status: "updated", airtableRecordId: updated.id };
      } else {
        const created = await withRetry(() => client.createRecord(fields));
        outcome = { taskId: task.id, status: "created", airtableRecordId: created.id };
      }

      await onSuccess(task.id, outcome.airtableRecordId, syncedAt);
      results.push(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : "export failed";
      await onFailure(task.id, message);
      results.push({ taskId: task.id, status: "failed", error: message });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return {
    projectId,
    total: tasks.length,
    created,
    updated,
    failed,
    results,
    syncedAt: syncedAt.toISOString(),
  };
}
