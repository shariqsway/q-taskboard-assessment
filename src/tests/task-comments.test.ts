import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createCommentSchema } from "@/schemas/comment";

const mockGetCurrentUser = vi.fn();
const mockGetProjectMembership = vi.fn();
const mockTaskFindUnique = vi.fn();
const mockCommentFindMany = vi.fn();
const mockCommentCreate = vi.fn();

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    getProjectMembership: (...args: unknown[]) => mockGetProjectMembership(...args),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
    },
    taskComment: {
      findMany: (...args: unknown[]) => mockCommentFindMany(...args),
      create: (...args: unknown[]) => mockCommentCreate(...args),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const TASK_ID = "task_1";
const PROJECT_ID = "project_1";

function getRequest() {
  return new NextRequest(`http://localhost/api/tasks/${TASK_ID}/comments`, {
    method: "GET",
    headers: { Authorization: "Bearer token" },
  });
}

function postRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${TASK_ID}/comments`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: TASK_ID }) };
}

describe("createCommentSchema", () => {
  it("accepts valid comment body", () => {
    expect(createCommentSchema.safeParse({ body: "Looks good" }).success).toBe(true);
  });

  it("rejects empty body", () => {
    expect(createCommentSchema.safeParse({ body: "" }).success).toBe(false);
  });
});

describe("POST /api/tasks/:id/comments authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "a@b.com", name: "A" });
    mockTaskFindUnique.mockResolvedValue({ id: TASK_ID, projectId: PROJECT_ID });
    mockCommentCreate.mockResolvedValue({
      id: "c_1",
      taskId: TASK_ID,
      body: "hello",
      createdAt: new Date("2026-01-01T12:00:00Z"),
      author: { id: "user_1", name: "A", email: "a@b.com" },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await POST(postRequest({ body: "hello" }), params());

    expect(res.status).toBe(401);
    expect(mockCommentCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a project member", async () => {
    mockGetProjectMembership.mockResolvedValue(null);
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await POST(postRequest({ body: "hello" }), params());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("you are not a member of this project");
    expect(mockCommentCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when user is a viewer", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await POST(postRequest({ body: "hello" }), params());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("viewers cannot add comments");
    expect(mockCommentCreate).not.toHaveBeenCalled();
  });

  it("returns 201 when user is a member", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await POST(postRequest({ body: "hello" }), params());

    expect(res.status).toBe(201);
    expect(mockCommentCreate).toHaveBeenCalled();
  });

  it("returns 201 when user is an admin", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "admin" });
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await POST(postRequest({ body: "hello" }), params());

    expect(res.status).toBe(201);
    expect(mockCommentCreate).toHaveBeenCalled();
  });
});

describe("GET /api/tasks/:id/comments authorization and ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "a@b.com", name: "A" });
    mockTaskFindUnique.mockResolvedValue({ id: TASK_ID, projectId: PROJECT_ID });
  });

  it("returns 403 when user is not a project member", async () => {
    mockGetProjectMembership.mockResolvedValue(null);
    const { GET } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await GET(getRequest(), params());

    expect(res.status).toBe(403);
    expect(mockCommentFindMany).not.toHaveBeenCalled();
  });

  it("returns 200 when user is a viewer", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });
    mockCommentFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await GET(getRequest(), params());

    expect(res.status).toBe(200);
    expect(mockCommentFindMany).toHaveBeenCalled();
  });

  it("queries comments in chronological order (oldest first)", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    mockCommentFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/tasks/[id]/comments/route");

    await GET(getRequest(), params());

    expect(mockCommentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
  });

  it("returns comments in chronological order", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });
    mockCommentFindMany.mockResolvedValue([
      {
        id: "c_1",
        taskId: TASK_ID,
        body: "first",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        author: { id: "u_1", name: "Alice", email: "a@b.com" },
      },
      {
        id: "c_2",
        taskId: TASK_ID,
        body: "second",
        createdAt: new Date("2026-01-01T11:00:00Z"),
        author: { id: "u_2", name: "Bob", email: "b@b.com" },
      },
    ]);
    const { GET } = await import("@/app/api/tasks/[id]/comments/route");

    const res = await GET(getRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.comments).toHaveLength(2);
    expect(body.comments[0].body).toBe("first");
    expect(body.comments[1].body).toBe("second");
    expect(body.comments[0].createdAt).toBe("2026-01-01T10:00:00.000Z");
    expect(body.comments[1].createdAt).toBe("2026-01-01T11:00:00.000Z");
  });
});

describe("append-only comment API", () => {
  it("does not export PATCH or DELETE handlers", async () => {
    const route = await import("@/app/api/tasks/[id]/comments/route");

    expect(route.GET).toBeTypeOf("function");
    expect(route.POST).toBeTypeOf("function");
    expect(route.PATCH).toBeUndefined();
    expect(route.DELETE).toBeUndefined();
  });
});
