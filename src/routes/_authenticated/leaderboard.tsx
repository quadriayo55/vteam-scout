import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { leaderboardQuery } from "@/lib/stats";
import { compact } from "@/lib/outreach";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Verunda Team Scoutier" },
      { name: "description", content: "Team ranking by outreach clicks and links generated." },
      { property: "og:title", content: "Leaderboard — Verunda Team Scoutier" },
      { property: "og:description", content: "Team ranking by outreach clicks and links generated." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const board = useQuery(leaderboardQuery(days));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked by links clicked, then links generated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 7, 30].map((option) => (
          <button
            key={option}
            onClick={() => setDays(option)}
            className={
              days === option
                ? "rounded-full bg-brand px-4 py-2 text-xs font-bold text-brand-foreground"
                : "rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            }
          >
            {option === 1 ? "Today" : `Last ${option} days`}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {(board.data ?? []).map((row, index) => {
          const isMe = row.user_id === user?.id;
          return (
            <li
              key={row.user_id}
              className={
                isMe
                  ? "panel flex items-center gap-3 border-brand/60 p-3 sm:p-4"
                  : "panel flex items-center gap-3 p-3 sm:p-4"
              }
            >
              <span className="w-8 shrink-0 text-center font-display text-lg font-bold text-muted-foreground">
                {index === 0 ? <Trophy className="mx-auto size-5 text-brand" /> : index + 1}
              </span>
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={row.avatar_url ?? undefined} alt={row.display_name} />
                <AvatarFallback className="bg-surface-2 text-xs font-bold">
                  {(row.display_name || row.email).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {row.display_name || row.email.split("@")[0]}
                  {isMe && <span className="ml-2 text-xs text-brand">you</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.team_name ?? "No team"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-bold text-brand tabular-nums">
                  {compact(Number(row.clicked))}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  of {compact(Number(row.generated))} generated
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {board.data?.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No members yet.</p>
      )}
    </div>
  );
}
