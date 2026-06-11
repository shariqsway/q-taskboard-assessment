import { describe, it, expect, beforeEach, vi } from "vitest";
import { AirtableMockClient, AirtableError } from "@/lib/airtable-mock";
import { createMockAirtableClient } from "@/lib/airtable/mock-adapter";
import { exportProjectTasks, type SyncRecord } from "@/lib/airtable/exporter";
import { withRetry, isRetryableError } from "@/lib/airtable/retry";
import type { ExportTaskInput, AirtableTableClient } from "@/lib/airtable/types";

const syncedAt = new Date("2026-01-01T00:00:00.000Z");

function makeTask(overrides: Partial<ExportTaskInput> = {}): ExportTaskInput {
  return {
    id: overrides.id ?? "task_1",
    projectId: "project_1",
    title: overrides.title ?? "Test task",
    description: overrides.description ?? "A description",
    status: overrides.status ?? "todo",
    position: overrides.position ?? 0,
    createdAt: overrides.createdAt ?? syncedAt,
    updatedAt: overrides.updatedAt ?? syncedAt,
    assignee: overrides.assignee ?? { name: "Alice", email: "alice@example.com" },
  };
}

function createSyncStore() {
  const syncByTaskId = new Map<string, SyncRecord>();
  const errors = new Map<string, string>();

  return {
    syncByTaskId,
    onSuccess: async (taskId: string, airtableRecordId: string, _syncedAt: Date) => {
      syncByTaskId.set(taskId, { airtableRecordId });
      errors.delete(taskId);
    },
    onFailure: async (taskId: string, error: string) => {
      errors.set(taskId, error);
    },
    errors,
  };
}

async function runExport(
  mock: AirtableMockClient,
  tasks: ExportTaskInput[],
  syncByTaskId: Map<string, SyncRecord>,
  callbacks: {
    onSuccess: (taskId: string, airtableRecordId: string, syncedAt: Date) => Promise<void>;
    onFailure: (taskId: string, error: string) => Promise<void>;
  },
  client?: AirtableTableClient,
) {
  return exportProjectTasks({
    projectId: "project_1",
    projectName: "Q3 Launch",
    tasks,
    syncByTaskId,
    client: client ?? createMockAirtableClient(mock),
    onSuccess: callbacks.onSuccess,
    onFailure: callbacks.onFailure,
  });
}

describe("airtable export", () => {
  let mock: AirtableMockClient;

  beforeEach(() => {
    mock = new AirtableMockClient();
  });

  it("exports all tasks successfully on first run", async () => {
    const store = createSyncStore();
    const tasks = [makeTask({ id: "task_a" }), makeTask({ id: "task_b", title: "Second" })];

    const report = await runExport(mock, tasks, store.syncByTaskId, store);

    expect(report.total).toBe(2);
    expect(report.created).toBe(2);
    expect(report.updated).toBe(0);
    expect(report.failed).toBe(0);
    expect(mock.__getRecordCount()).toBe(2);
    expect(store.syncByTaskId.size).toBe(2);
  });

  it("updates existing records on duplicate export without creating duplicates", async () => {
    const store = createSyncStore();
    const tasks = [makeTask({ id: "task_a" }), makeTask({ id: "task_b", title: "Second" })];

    await runExport(mock, tasks, store.syncByTaskId, store);
    const report = await runExport(mock, tasks, store.syncByTaskId, store);

    expect(report.created).toBe(0);
    expect(report.updated).toBe(2);
    expect(report.failed).toBe(0);
    expect(mock.__getRecordCount()).toBe(2);
  });

  it("retries transient failures and eventually succeeds", async () => {
    mock.__setFailNextCalls(2, "rate-limit");
    const store = createSyncStore();
    const tasks = [makeTask({ id: "task_a" })];

    const report = await runExport(mock, tasks, store.syncByTaskId, store);

    expect(report.failed).toBe(0);
    expect(report.created).toBe(1);
    expect(mock.__getRecordCount()).toBe(1);
  });

  it("continues after individual task failures and returns partial report", async () => {
    const baseClient = createMockAirtableClient(mock);
    const failingClient: AirtableTableClient = {
      ...baseClient,
      createRecord(fields) {
        const taskId = fields["TaskBoard Task ID"] as string;
        if (taskId === "task_fail") {
          throw new AirtableError("permanent failure", "server-error", 400);
        }
        return baseClient.createRecord(fields);
      },
      updateRecord(recordId, fields) {
        return baseClient.updateRecord(recordId, fields);
      },
      findByTaskBoardId(taskBoardId) {
        return baseClient.findByTaskBoardId(taskBoardId);
      },
    };

    const store = createSyncStore();
    const tasks = [
      makeTask({ id: "task_ok", title: "OK" }),
      makeTask({ id: "task_fail", title: "Fail" }),
    ];

    const report = await runExport(mock, tasks, store.syncByTaskId, store, failingClient);

    expect(report.total).toBe(2);
    expect(report.created).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.results.find((r) => r.taskId === "task_ok")?.status).toBe("created");
    expect(report.results.find((r) => r.taskId === "task_fail")?.status).toBe("failed");
    expect(mock.__getRecordCount()).toBe(1);
    expect(store.syncByTaskId.has("task_ok")).toBe(true);
    expect(store.syncByTaskId.has("task_fail")).toBe(false);
  });
});

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new AirtableError("rate limited", "rate-limit", 429);
        }
        return "ok";
      },
      { baseDelayMs: 1, maxDelayMs: 5 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    expect(isRetryableError(new AirtableError("bad request", "server-error", 400))).toBe(false);

    await expect(
      withRetry(
        async () => {
          throw new AirtableError("bad request", "server-error", 400);
        },
        { baseDelayMs: 1 },
      ),
    ).rejects.toThrow("bad request");
  });
});
