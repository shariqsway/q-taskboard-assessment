import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { getAirtableConfig } from "@/lib/airtable/config";
import { createAirtableClient } from "@/lib/airtable/client";
import { exportProjectTasks } from "@/lib/airtable/exporter";
import type { ExportTaskInput } from "@/lib/airtable/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: projectId } = await params;
  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot export tasks");
  }

  const config = getAirtableConfig();
  if (!config) {
    return NextResponse.json({ error: "airtable not configured" }, { status: 503 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        include: {
          assignee: { select: { name: true, email: true } },
        },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      },
    },
  });

  if (!project) return notFound("project not found");

  const syncRows = await prisma.taskAirtableSync.findMany({
    where: { taskId: { in: project.tasks.map((t) => t.id) } },
  });

  const syncByTaskId = new Map(
    syncRows.map((row) => [row.taskId, { airtableRecordId: row.airtableRecordId }]),
  );

  const tasks: ExportTaskInput[] = project.tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    status: t.status,
    position: t.position,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    assignee: t.assignee,
  }));

  const client = createAirtableClient(config);

  const report = await exportProjectTasks({
    projectId,
    projectName: project.name,
    tasks,
    syncByTaskId,
    client,
    onSuccess: async (taskId, airtableRecordId, syncedAt) => {
      await prisma.taskAirtableSync.upsert({
        where: { taskId },
        create: { taskId, airtableRecordId, lastSyncedAt: syncedAt },
        update: { airtableRecordId, lastSyncedAt: syncedAt, lastError: null },
      });
    },
    onFailure: async (taskId, error) => {
      const existing = await prisma.taskAirtableSync.findUnique({ where: { taskId } });
      if (existing) {
        await prisma.taskAirtableSync.update({
          where: { taskId },
          data: { lastError: error },
        });
      }
    },
  });

  return NextResponse.json({ report });
}
