"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatActivityMessage } from "@/lib/activity/build";
import type { ApiActivity } from "@/lib/activity/types";
import { STATUS_LABELS } from "@/types";

type Props = {
  projectId: string;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityFeed({ projectId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", projectId],
    queryFn: () =>
      apiFetch<{ activities: ApiActivity[] }>(`/api/projects/${projectId}/activity`),
  });

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium mb-3">activity</h2>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        {isLoading && (
          <p className="px-4 py-3 text-sm text-muted">loading activity…</p>
        )}
        {error && (
          <p className="px-4 py-3 text-sm text-red-400" role="alert">
            {error instanceof Error ? error.message : "failed to load activity"}
          </p>
        )}
        {data && data.activities.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted italic">no activity yet</p>
        )}
        {data &&
          data.activities.map((activity) => (
            <article key={activity.id} className="px-4 py-3">
              <p className="text-sm">{formatActivity(activity)}</p>
              <p className="text-xs text-muted mt-1">{formatTime(activity.createdAt)}</p>
            </article>
          ))}
      </div>
    </section>
  );
}

function formatActivity(activity: ApiActivity): string {
  return formatActivityMessage(
    activity.type,
    activity.actor.name,
    activity.taskTitle,
    activity.metadata,
    STATUS_LABELS,
  );
}
