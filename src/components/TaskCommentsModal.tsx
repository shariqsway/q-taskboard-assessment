"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiComment, ApiTask } from "@/types";

type Props = {
  task: ApiTask;
  canComment: boolean;
  onClose: () => void;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskCommentsModal({ task, canComment, onClose }: Props) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ["comments", task.id],
    queryFn: () =>
      apiFetch<{ comments: ApiComment[] }>(`/api/tasks/${task.id}/comments`),
  });

  const addComment = useMutation({
    mutationFn: (text: string) =>
      apiFetch<{ comment: ApiComment }>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      }),
    onSuccess: () => {
      setBody("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["comments", task.id] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "failed to add comment"),
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border rounded-lg p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">comments</h2>
            <p className="text-xs text-muted mt-0.5">{task.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[120px] mb-4">
          {isLoading && <p className="text-sm text-muted">loading…</p>}
          {queryError && (
            <p className="text-sm text-red-400" role="alert">
              {queryError instanceof Error ? queryError.message : "failed to load"}
            </p>
          )}
          {data && data.comments.length === 0 && (
            <p className="text-sm text-muted italic">no comments yet</p>
          )}
          {data && data.comments.length > 0 && (
            <ul className="space-y-3">
              {data.comments.map((comment) => (
                <li
                  key={comment.id}
                  className="bg-bg border border-border rounded-md px-3 py-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{comment.author.name}</span>
                    <span className="text-xs text-muted">{formatTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canComment ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = body.trim();
              if (!text) return;
              addComment.mutate(text);
            }}
          >
            <label className="block mb-2">
              <span className="text-xs text-muted">add a comment</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="write a comment…"
                className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            {error && (
              <p className="text-sm text-red-400 mb-2" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted"
              >
                close
              </button>
              <button
                type="submit"
                disabled={addComment.isPending || !body.trim()}
                className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {addComment.isPending ? "posting…" : "post comment"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-muted">viewers can read comments but cannot post.</p>
        )}
      </div>
    </div>
  );
}
