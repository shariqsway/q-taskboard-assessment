import Airtable from "airtable";
import { getAirtableConfig, type AirtableConfig } from "./config";
import { TASKBOARD_ID_FIELD } from "./mapper";
import type { AirtableFieldMap, AirtableTableClient } from "./types";

function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function toFieldSet(fields: AirtableFieldMap): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value === null ? undefined : value;
  }
  return out;
}

function recordToResult(record: Airtable.Record<Airtable.FieldSet>) {
  return {
    id: record.getId(),
    fields: record.fields as AirtableFieldMap,
  };
}

export function createAirtableClient(config: AirtableConfig): AirtableTableClient {
  const base = new Airtable({ apiKey: config.apiKey }).base(config.baseId);
  const table = base(config.tableName);

  return {
    createRecord(fields: AirtableFieldMap) {
      const payload = toFieldSet(fields);
      return new Promise((resolve, reject) => {
        table.create(payload, { typecast: true }, (err: Error | null, record) => {
          if (err) return reject(normalizeError(err));
          if (!record) return reject(new Error("no record returned from airtable"));
          resolve(recordToResult(record));
        });
      });
    },

    updateRecord(recordId: string, fields: AirtableFieldMap) {
      const payload = toFieldSet(fields);
      return new Promise((resolve, reject) => {
        table.update(recordId, payload, { typecast: true }, (err: Error | null, record) => {
          if (err) return reject(normalizeError(err));
          if (!record) return reject(new Error("no record returned from airtable"));
          resolve(recordToResult(record));
        });
      });
    },

    findByTaskBoardId(taskBoardId: string) {
      const formula = `{${TASKBOARD_ID_FIELD}} = '${escapeFormulaValue(taskBoardId)}'`;
      return new Promise((resolve, reject) => {
        table
          .select({ filterByFormula: formula, maxRecords: 1 })
          .firstPage((err: Error | null, records) => {
            if (err) return reject(normalizeError(err));
            if (!records || records.length === 0) return resolve(null);
            resolve(recordToResult(records[0]));
          });
      });
    },
  };
}

export function getDefaultAirtableClient(): AirtableTableClient {
  const config = getAirtableConfig();
  if (!config) {
    throw new Error("airtable not configured");
  }
  return createAirtableClient(config);
}
