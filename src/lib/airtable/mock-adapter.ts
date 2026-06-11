import type { AirtableMockClient } from "@/lib/airtable-mock";
import { TASKBOARD_ID_FIELD } from "./mapper";
import type { AirtableFieldMap, AirtableTableClient } from "./types";

export function createMockAirtableClient(mock: AirtableMockClient): AirtableTableClient {
  return {
    async createRecord(fields: AirtableFieldMap) {
      const record = await mock.create({ fields });
      return { id: record.id, fields: record.fields as AirtableFieldMap };
    },

    async updateRecord(recordId: string, fields: AirtableFieldMap) {
      const record = await mock.update(recordId, fields);
      return { id: record.id, fields: record.fields as AirtableFieldMap };
    },

    async findByTaskBoardId(taskBoardId: string) {
      const record = await mock.findByTaskBoardId(taskBoardId);
      if (!record) return null;
      return { id: record.id, fields: record.fields as AirtableFieldMap };
    },
  };
}

export { TASKBOARD_ID_FIELD };
