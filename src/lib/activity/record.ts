import { prisma } from "@/lib/prisma";
import {
  buildTaskCreatedActivity,
  buildTaskUpdateActivities,
} from "./build";
import type { ActivityInput, TaskSnapshot } from "./types";

export async function recordActivities(activities: ActivityInput[]): Promise<void> {
  if (activities.length === 0) return;

  await prisma.activity.createMany({
    data: activities.map((a) => ({
      projectId: a.projectId,
      taskId: a.taskId,
      actorId: a.actorId,
      type: a.type,
      taskTitle: a.taskTitle,
      metadata: a.metadata ?? undefined,
    })),
  });
}

export async function recordTaskCreated(
  task: TaskSnapshot,
  actorId: string,
): Promise<void> {
  await recordActivities([buildTaskCreatedActivity(task, actorId)]);
}

export async function recordTaskUpdated(
  before: TaskSnapshot,
  after: TaskSnapshot,
  actorId: string,
): Promise<void> {
  const [assigneeBefore, assigneeAfter] = await Promise.all([
    before.assigneeId
      ? prisma.user.findUnique({
          where: { id: before.assigneeId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    after.assigneeId
      ? prisma.user.findUnique({
          where: { id: after.assigneeId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const activities = buildTaskUpdateActivities(
    before,
    after,
    actorId,
    assigneeBefore,
    assigneeAfter,
  );
  await recordActivities(activities);
}

export async function listProjectActivities(projectId: string, limit = 50) {
  return prisma.activity.findMany({
    where: { projectId },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
