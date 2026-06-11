import { PATCH } from "@/app/api/tasks/[id]/route";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockGetProjectMembership = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    getProjectMembership: (...args: unknown[]) =>
      mockGetProjectMembership(...args),
  };
});

const TASK_ID = "task_1";
const PROJECT_ID = "project_1";
const existingTask = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  title: "Original",
  description: null,
  status: "todo" as const,
  assigneeId: null,
  createdById: "user_admin",
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${TASK_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/tasks/:id authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(existingTask);
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "a@b.com",
      name: "A",
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ title: "New" }), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a project member", async () => {
    mockGetProjectMembership.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ title: "New" }), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("you are not a member of this project");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when user is a viewer", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });

    const res = await PATCH(patchRequest({ title: "New" }), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("viewers cannot update tasks");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 when user is a member", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    mockUpdate.mockResolvedValue({ ...existingTask, title: "Updated" });

    const res = await PATCH(patchRequest({ title: "Updated" }), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 200 when user is an admin", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "admin" });
    mockUpdate.mockResolvedValue({ ...existingTask, title: "Updated" });

    const res = await PATCH(patchRequest({ title: "Updated" }), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
