import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  getProjectMembership,
} from "@/lib/auth";
import { listProjectActivities } from "@/lib/activity/record";
import type { ApiActivity } from "@/lib/activity/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: projectId } = await params;
  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return forbidden("you are not a member of this project");

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

  const rows = await listProjectActivities(projectId, limit);

  const activities: ApiActivity[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    metadata: (row.metadata as ApiActivity["metadata"]) ?? null,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
  }));

  return NextResponse.json({ activities });
}
