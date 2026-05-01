import { useQuery } from "@tanstack/react-query";
import { Archive, Bot, ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useServer } from "@/hooks/useServer";
import { api, type ArchivedBotSummary, type BotRunSummary } from "@/lib/api";
import { ArchivedBotDetail } from "@/pages/tabs/ArchivedBotsTab";

const PAGE_SIZE = 50;

function formatStatus(value: string): string {
  if (!value || value === "unknown") return "Unknown";
  return value.toLowerCase().replace(/_/g, " ");
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const time = timestampMs(value);
  if (!time) return value;
  return new Date(time).toLocaleString();
}

function runTimestamp(run: BotRunSummary): string | null {
  return run.archived_at || run.updated_at || run.deployed_at || run.created_at;
}

function timestampMs(value: string | null): number {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function statusClass(run: BotRunSummary): string {
  const deployment = run.deployment_status.toLowerCase();
  const status = run.run_status.toLowerCase();
  if (deployment === "archived") return "text-[var(--color-text-muted)]";
  if (status === "created") return "text-[var(--color-yellow)]";
  if (status === "error" || deployment === "failed") return "text-[var(--color-red)]";
  return "text-[var(--color-text-muted)]";
}

function BotRunStatus({ run }: { run: BotRunSummary }) {
  const deployment = run.deployment_status.toLowerCase();
  const status = run.run_status.toLowerCase();
  const Icon = deployment === "archived" ? Archive : Bot;
  return (
    <span className={`inline-flex items-center gap-1.5 capitalize ${statusClass(run)}`}>
      <Icon className="h-3.5 w-3.5" />
      {deployment === "archived" ? "Archived" : formatStatus(status)}
    </span>
  );
}

function rawString(run: BotRunSummary, key: string): string {
  const value = run.raw[key];
  return typeof value === "string" ? value : "";
}

function findArchivedBot(
  run: BotRunSummary,
  archivedBots: ArchivedBotSummary[],
): ArchivedBotSummary | null {
  const rawDbPath = rawString(run, "db_path") || rawString(run, "path");
  if (rawDbPath) {
    const byPath = archivedBots.find((bot) => bot.db_path === rawDbPath);
    if (byPath) return byPath;
    return {
      bot_name: run.bot_name,
      db_path: rawDbPath,
      total_trades: 0,
      total_orders: 0,
      trading_pairs: [],
      exchanges: [],
      start_time: null,
      end_time: null,
    };
  }
  return (
    archivedBots.find((bot) => bot.bot_name === run.bot_name) ||
    archivedBots.find((bot) => bot.db_path.includes(run.bot_name)) ||
    null
  );
}

function BotNameCell({
  run,
  archivedBot,
  onOpenArchived,
}: {
  run: BotRunSummary;
  archivedBot: ArchivedBotSummary | null;
  onOpenArchived: (bot: ArchivedBotSummary) => void;
}) {
  if (!run.bot_name) return <span>-</span>;
  if (run.deployment_status.toLowerCase() === "archived") {
    if (archivedBot) {
      return (
        <button
          type="button"
          onClick={() => onOpenArchived(archivedBot)}
          className="font-medium text-left hover:underline"
        >
          {run.bot_name}
        </button>
      );
    }
    return <span className="font-medium">{run.bot_name}</span>;
  }
  return (
    <Link to={`/bots/${run.bot_name}`} className="font-medium hover:underline">
      {run.bot_name}
    </Link>
  );
}

function BotRunsList({
  onOpenArchived,
}: {
  onOpenArchived: (bot: ArchivedBotSummary) => void;
}) {
  const { server } = useServer();
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["bot-runs", server, offset],
    queryFn: () => api.getBotRuns(server!, { limit: PAGE_SIZE, offset }),
    enabled: !!server,
    refetchInterval: 10000,
  });

  const { data: archivedData } = useQuery({
    queryKey: ["archived-bots", server],
    queryFn: () => api.getArchivedBots(server!),
    enabled: !!server,
    staleTime: 30000,
  });

  const runs = data?.runs ?? [];
  const archivedBots = archivedData?.bots ?? [];
  const totalCount = data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const sortedRuns = useMemo(
    () =>
      [...runs].sort((a, b) => {
        const aTime = runTimestamp(a);
        const bTime = runTimestamp(b);
        return timestampMs(bTime) - timestampMs(aTime);
      }),
    [runs],
  );

  if (!server) {
    return <p className="text-[var(--color-text-muted)]">Select a server</p>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-[var(--color-red)]">
        {error instanceof Error ? error.message : "Failed to load bot runs"}
      </p>
    );
  }

  if (sortedRuns.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-[var(--color-text-muted)]">
        <Clock className="h-10 w-10" />
        <p>No inactive or archived bot runs found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-text)]">Bot Runs</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Created, stopped, errored, and archived runs
          </p>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">
          {totalCount} run{totalCount === 1 ? "" : "s"}
          {isFetching ? " - refreshing" : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Bot
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Strategy
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Account
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Last Update
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRuns.map((run, idx) => (
                <tr
                  key={`${run.bot_name}-${run.run_status}-${run.deployment_status}-${idx}`}
                  className="border-b border-[var(--color-border)]/30 last:border-0 hover:bg-[var(--color-surface-hover)]/50"
                >
                  <td className="px-4 py-2.5">
                    <BotNameCell
                      run={run}
                      archivedBot={findArchivedBot(run, archivedBots)}
                      onOpenArchived={onOpenArchived}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <BotRunStatus run={run} />
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    <div className="flex flex-col">
                      <span>{run.strategy_name || "-"}</span>
                      {run.strategy_type && (
                        <span className="text-xs capitalize">{formatStatus(run.strategy_type)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    {run.account_name || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-text-muted)]">
                    {formatDate(runTimestamp(run))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
        <span>
          Page {page + 1} of {totalPages}
        </span>
        <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page <= 0 || isFetching}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
            onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
            disabled={page >= totalPages - 1 || isFetching}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function BotRunsTab() {
  const [selectedArchivedBot, setSelectedArchivedBot] = useState<ArchivedBotSummary | null>(null);

  if (selectedArchivedBot) {
    return (
      <ArchivedBotDetail
        dbPath={selectedArchivedBot.db_path}
        startTime={selectedArchivedBot.start_time ?? undefined}
        endTime={selectedArchivedBot.end_time ?? undefined}
        onBack={() => setSelectedArchivedBot(null)}
      />
    );
  }

  return (
    <BotRunsList onOpenArchived={setSelectedArchivedBot} />
  );
}
