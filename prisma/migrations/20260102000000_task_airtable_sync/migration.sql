-- CreateTable
CREATE TABLE "task_airtable_syncs" (
    "task_id" TEXT NOT NULL,
    "airtable_record_id" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,

    CONSTRAINT "task_airtable_syncs_pkey" PRIMARY KEY ("task_id")
);

-- AddForeignKey
ALTER TABLE "task_airtable_syncs" ADD CONSTRAINT "task_airtable_syncs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
