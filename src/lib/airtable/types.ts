export type AirtableFieldMap = Record<string, string | number | null>;

export type TaskExportOutcome =
  | { taskId: string; status: "created"; airtableRecordId: string }
  | { taskId: string; status: "updated"; airtableRecordId: string }
  | { taskId: string; status: "failed"; error: string };

export type ExportReport = {
  projectId: string;
  total: number;
  created: number;
  updated: number;
  failed: number;
  results: TaskExportOutcome[];
  syncedAt: string;
};

export type ExportTaskInput = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  assignee: { name: string; email: string } | null;
};

export type AirtableRecordResult = {
  id: string;
  fields: AirtableFieldMap;
};

export type AirtableTableClient = {
  createRecord(fields: AirtableFieldMap): Promise<AirtableRecordResult>;
  updateRecord(recordId: string, fields: AirtableFieldMap): Promise<AirtableRecordResult>;
  findByTaskBoardId(taskBoardId: string): Promise<AirtableRecordResult | null>;
};
