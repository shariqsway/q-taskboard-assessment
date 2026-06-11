import { describe, it, expect } from "vitest";
import {
  buildTaskCreatedActivity,
  buildTaskUpdateActivities,
  formatActivityMessage,
} from "@/lib/activity/build";
import { STATUS_LABELS } from "@/types";

const baseTask = {
  id: "task_1",
  projectId: "project_1",
  title: "Ship feature",
  status: "todo" as const,
  assigneeId: null as string | null,
};

describe("buildTaskCreatedActivity", () => {
  it("creates a task_created activity", () => {
    const activity = buildTaskCreatedActivity(baseTask, "user_1");
    expect(activity.type).toBe("task_created");
    expect(activity.taskTitle).toBe("Ship feature");
    expect(activity.actorId).toBe("user_1");
  });
});

describe("buildTaskUpdateActivities", () => {
  it("records status change", () => {
    const activities = buildTaskUpdateActivities(
      baseTask,
      { ...baseTask, status: "in_progress" },
      "user_1",
      null,
      null,
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("status_changed");
    expect(activities[0].metadata).toEqual({
      fromStatus: "todo",
      toStatus: "in_progress",
    });
  });

  it("records assignee change", () => {
    const activities = buildTaskUpdateActivities(
      baseTask,
      { ...baseTask, assigneeId: "user_2" },
      "user_1",
      null,
      { id: "user_2", name: "Bob" },
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("assignee_changed");
    expect(activities[0].metadata).toEqual({
      fromAssigneeId: null,
      toAssigneeId: "user_2",
      fromAssigneeName: null,
      toAssigneeName: "Bob",
    });
  });

  it("records both status and assignee changes", () => {
    const activities = buildTaskUpdateActivities(
      { ...baseTask, assigneeId: "user_2" },
      { ...baseTask, status: "done", assigneeId: "user_3" },
      "user_1",
      { id: "user_2", name: "Bob" },
      { id: "user_3", name: "Carol" },
    );
    expect(activities).toHaveLength(2);
    expect(activities.map((a) => a.type)).toEqual(["status_changed", "assignee_changed"]);
  });

  it("returns empty when nothing tracked changed", () => {
    const activities = buildTaskUpdateActivities(
      baseTask,
      { ...baseTask, title: "Renamed only" },
      "user_1",
      null,
      null,
    );
    expect(activities).toHaveLength(0);
  });
});

describe("formatActivityMessage", () => {
  it("formats task created", () => {
    expect(
      formatActivityMessage("task_created", "Alice", "Ship feature", null, STATUS_LABELS),
    ).toBe('Alice created "Ship feature"');
  });

  it("formats status changed", () => {
    expect(
      formatActivityMessage(
        "status_changed",
        "Alice",
        "Ship feature",
        { fromStatus: "todo", toStatus: "in_progress" },
        STATUS_LABELS,
      ),
    ).toBe('Alice moved "Ship feature" from To do to In progress');
  });

  it("formats assignee changed", () => {
    expect(
      formatActivityMessage(
        "assignee_changed",
        "Alice",
        "Ship feature",
        {
          fromAssigneeId: null,
          toAssigneeId: "user_2",
          fromAssigneeName: null,
          toAssigneeName: "Bob",
        },
        STATUS_LABELS,
      ),
    ).toBe('Alice reassigned "Ship feature" from unassigned to Bob');
  });
});
