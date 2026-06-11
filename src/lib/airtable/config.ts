export type AirtableConfig = {
  apiKey: string;
  baseId: string;
  tableName: string;
};

export function getAirtableConfig(): AirtableConfig | null {
  const apiKey = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  const tableName = process.env.AIRTABLE_TABLE_NAME?.trim() || "Tasks";

  if (!apiKey || !baseId) return null;
  return { apiKey, baseId, tableName };
}
