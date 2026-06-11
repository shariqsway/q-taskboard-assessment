import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { createCommentSchema } from "@/schemas/comment";
import type { ApiComment } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return notFound("task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  if (!membership) return forbidden("you are not a member of this project");

  const rows = await prisma.taskComment.findMany({
    where: { taskId },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const comments: ApiComment[] = rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
  }));

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return notFound("task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot add comments");
  }

  const body = await req.json().catch(() => null);
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) return badRequest("invalid input", parsed.error.flatten());

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      authorId: user.id,
      body: parsed.data.body,
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  const response: ApiComment = {
    id: comment.id,
    taskId: comment.taskId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: comment.author,
  };

  return NextResponse.json({ comment: response }, { status: 201 });
}
