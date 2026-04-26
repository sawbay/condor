import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Circle, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { BotTradeHistory } from "@/components/bots/BotTradeHistory";
import { useServer } from "@/hooks/useServer";
import { api } from "@/lib/api";

type LogEntry = {
  timestamp: string;
  summary: string;
  fullText: string;
  sortKey: number;
  isError: boolean;
};

function humanizeTimestamp(raw: string): string {
  if (!raw) return "";

  const unixSeconds = Number(raw);
  if (Number.isFinite(unixSeconds) && raw.match(/^\d+(?:\.\d+)?$/)) {
    const date = new Date(unixSeconds * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    }
  }

  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(iso);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  const bracketMatch = raw.match(/^(\d{2}:\d{2}:\d{2})$/);
  if (bracketMatch) return bracketMatch[1];
  return raw;
}

function parseLogEntry(log: string | Record<string, unknown>): LogEntry {
  if (typeof log === "string") {
    let sortKey = Number.NEGATIVE_INFINITY;
    const bracketMatch = log.match(/^\[(.+?)\]\s*(.*)$/s);
    if (bracketMatch) {
      const parsed = Date.parse(bracketMatch[1].includes("T") ? bracketMatch[1] : bracketMatch[1].replace(" ", "T"));
      if (!Number.isNaN(parsed)) sortKey = parsed;
      return {
        timestamp: humanizeTimestamp(bracketMatch[1]),
        summary: bracketMatch[2] || bracketMatch[1],
        fullText: bracketMatch[2] || bracketMatch[1],
        sortKey,
        isError: false,
      };
    }

    const tsMatch = log.match(
      /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{3})?(?:Z|[+-]\d{2}:\d{2})?)\s+(.*)$/s,
    );
    if (tsMatch) {
      const parsed = Date.parse(tsMatch[1].replace(" ", "T"));
      return {
        timestamp: humanizeTimestamp(tsMatch[1]),
        summary: tsMatch[2],
        fullText: tsMatch[2],
        sortKey: Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed,
        isError: false,
      };
    }

    return {
      timestamp: "",
      summary: log,
      fullText: log,
      sortKey,
      isError: false,
    };
  }

  const timestamp = String(log.timestamp ?? log.time ?? log.ts ?? "");
  const message = String(log.msg ?? log.message ?? log.detail ?? JSON.stringify(log));
  const humanTimestamp = humanizeTimestamp(timestamp);
  const numericTimestamp = Number(timestamp);
  const sortKey = Number.isFinite(numericTimestamp)
    ? numericTimestamp < 1e12
      ? numericTimestamp * 1000
      : numericTimestamp
    : Number.isNaN(Date.parse(timestamp.replace(" ", "T")))
      ? Number.NEGATIVE_INFINITY
      : Date.parse(timestamp.replace(" ", "T"));
  return {
    timestamp: humanTimestamp,
    summary: message.length > 140 ? `${message.slice(0, 137)}...` : message,
    fullText: message,
    sortKey,
    isError: false,
  };
}

export function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const { server } = useServer();
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [now, setNow] = useState(Date.now());
  const logsScrollRef = useRef<HTMLDivElement | null>(null);
  const [refreshAnchor, setRefreshAnchor] = useState<number | null>(null);
  const refreshIntervalMs = 10000;

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["bot", server, id],
    queryFn: () => api.getBot(server!, id!),
    enabled: !!server && !!id,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    if (autoRefresh) {
      setRefreshAnchor(Date.now());
      return;
    }
    setRefreshAnchor(null);
  }, [autoRefresh]);

  useEffect(() => {
    if (autoRefresh && dataUpdatedAt) {
      setRefreshAnchor(dataUpdatedAt);
    }
  }, [autoRefresh, dataUpdatedAt]);

  useEffect(() => {
    const el = logsScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [dataUpdatedAt, data?.error_logs.length, data?.general_logs.length]);

  const invalidateBotData = () => {
    void queryClient.invalidateQueries({ queryKey: ["bot", server, id] });
    void queryClient.invalidateQueries({ queryKey: ["bots", server] });
  };

  const stopBotMutation = useMutation({
    mutationFn: () => api.stopBot(server!, id!),
    onSuccess: invalidateBotData,
  });

  const stopControllersMutation = useMutation({
    mutationFn: () => api.stopBotControllers(server!, id!),
    onSuccess: invalidateBotData,
  });

  const startControllersMutation = useMutation({
    mutationFn: () => api.startBotControllers(server!, id!),
    onSuccess: invalidateBotData,
  });

  if (!server || !id) return null;
  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading...</p>;
  if (error) {
    return (
      <p className="text-[var(--color-red)]">
        {error instanceof Error ? error.message : "Error"}
      </p>
    );
  }
  if (!data) return null;

  const { bot, config, performance, general_logs, error_logs } = data;
  const perfRecord = performance as Record<string, unknown>;
  const perfEntries = Object.entries(perfRecord);
  const scalarPerformanceEntries = perfEntries.filter(([, value]) => {
    return value === null || typeof value !== "object" || Array.isArray(value);
  });
  const controllerPerformanceEntries = perfEntries.filter(([, value]) => {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  });
  const statusColor =
    bot.status === "running"
      ? "text-[var(--color-green)]"
      : "text-[var(--color-red)]";

  const parsedLogs = [
    ...error_logs.map((log) => ({ ...parseLogEntry(log), isError: true })),
    ...general_logs.map((log) => parseLogEntry(log)),
  ].sort((a, b) => a.sortKey - b.sortKey);
  const countdownSeconds =
    autoRefresh && refreshAnchor
      ? Math.max(0, Math.ceil((refreshIntervalMs - (now - refreshAnchor)) / 1000))
      : null;

  return (
    <div>
      <Link
        to="/bots"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bots
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-bold">{bot.name}</h2>
        <span className={`flex items-center gap-1.5 text-sm ${statusColor}`}>
          <Circle className="h-2 w-2 fill-current" />
          {bot.status}
        </span>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => stopBotMutation.mutate()}
          disabled={bot.status !== "running" || stopBotMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-red)]/35 bg-[var(--color-red)]/10 px-3 py-2 text-sm font-medium text-[var(--color-red)] transition-colors hover:bg-[var(--color-red)]/15 disabled:cursor-not-allowed disabled:opacity-40"
          title="Stop the bot and archive it"
        >
          {stopBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          Stop
        </button>
        {bot.status === "running" && (
          <>
            <button
              type="button"
              onClick={() => stopControllersMutation.mutate()}
              disabled={stopControllersMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-red)]/35 bg-[var(--color-red)]/10 px-3 py-2 text-sm font-medium text-[var(--color-red)] transition-colors hover:bg-[var(--color-red)]/15 disabled:cursor-not-allowed disabled:opacity-40"
              title="Stop controllers inside this running bot"
            >
              {stopControllersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop controllers
            </button>
            <button
              type="button"
              onClick={() => startControllersMutation.mutate()}
              disabled={startControllersMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-green)]/35 bg-[var(--color-green)]/10 px-3 py-2 text-sm font-medium text-[var(--color-green)] transition-colors hover:bg-[var(--color-green)]/15 disabled:cursor-not-allowed disabled:opacity-40"
              title="Resume controllers inside this running bot"
            >
              {startControllersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start controllers
            </button>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 font-medium text-[var(--color-text-muted)]">
            Configuration
          </h3>
          {Object.keys(config).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No config available</p>
          ) : (
            <dl className="space-y-2 text-sm">
              {Object.entries(config).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">{k}</dt>
                  <dd className="font-mono text-right">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 font-medium text-[var(--color-text-muted)]">
            Performance
          </h3>
          {perfEntries.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No performance data</p>
          ) : (
            <>
              {scalarPerformanceEntries.length > 0 && (
                <dl className="space-y-2 text-sm">
                  {scalarPerformanceEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-[var(--color-text-muted)]">{k}</dt>
                      <dd className="font-mono text-right">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {controllerPerformanceEntries.length > 0 && (
                <div
                  className={
                    scalarPerformanceEntries.length > 0
                      ? "mt-4 border-t border-[var(--color-border)] pt-4"
                      : ""
                  }
                >
                  <h4 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
                    Controllers
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-[var(--color-text-muted)]">
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="py-2 pr-4 font-medium">Controller</th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 pr-4 font-medium">PnL</th>
                          <th className="py-2 pr-4 font-medium">Volume</th>
                          <th className="py-2 pr-4 font-medium">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {controllerPerformanceEntries.map(([controllerName, controllerData]) => {
                          const ctrl = controllerData as Record<string, unknown>;
                          const nestedPerf = (ctrl.performance ?? {}) as Record<string, unknown>;
                          const realized = Number(nestedPerf.realized_pnl_quote ?? 0);
                          const unrealized = Number(nestedPerf.unrealized_pnl_quote ?? 0);
                          const globalPnl = Number(
                            nestedPerf.global_pnl_quote ?? realized + unrealized,
                          );
                          const volume = Number(nestedPerf.volume_traded ?? 0);
                          const status = String(ctrl.status ?? "unknown");
                          const details = [
                            ctrl.connector_name ?? ctrl.connector,
                            ctrl.trading_pair,
                            nestedPerf.global_pnl_pct !== undefined
                              ? `PnL % ${String(nestedPerf.global_pnl_pct)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .map(String)
                            .join(" | ");

                          return (
                            <tr
                              key={controllerName}
                              className="border-b border-[var(--color-border)]/60 last:border-0"
                            >
                              <td className="py-2 pr-4 font-medium">{controllerName}</td>
                              <td className="py-2 pr-4">{status}</td>
                              <td className="py-2 pr-4 font-mono">{globalPnl.toFixed(2)}</td>
                              <td className="py-2 pr-4 font-mono">{volume.toFixed(2)}</td>
                              <td className="py-2 pr-4 text-xs text-[var(--color-text-muted)]">
                                {details || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <BotTradeHistory server={server} botId={id} />
      </div>

      <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-[var(--color-text-muted)]">Logs</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {parsedLogs.length} log entries
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh logs
              </button>
              <button
                type="button"
                onClick={() => setAutoRefresh((value) => !value)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
                  autoRefresh
                    ? "border-[var(--color-green)]/40 bg-[var(--color-green)]/10 text-[var(--color-green)]"
                    : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
                }`}
              >
                Auto
                <span className="text-[10px] opacity-75">
                  {autoRefresh ? `${countdownSeconds ?? 0}s` : "off"}
                </span>
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {dataUpdatedAt ? `updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
              {dataUpdatedAt && isFetching ? " · " : ""}
              {isFetching ? "refreshing" : ""}
            </p>
          </div>
        </div>

        {parsedLogs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No logs available.</p>
        ) : (
          <div ref={logsScrollRef} className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <div className="space-y-2 text-xs text-[var(--color-text)]">
                {parsedLogs.map((log, idx) => (
                  <details
                    key={`${log.sortKey}-${idx}`}
                    className={`group rounded border px-3 py-2 ${
                      log.isError
                        ? "border-[var(--color-red)]/30 bg-[var(--color-red)]/5"
                        : "border-[var(--color-border)]/40 bg-[var(--color-surface)]"
                    }`}
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start gap-3">
                        <span
                          className={`min-w-44 font-mono ${
                            log.isError
                              ? "text-[var(--color-red)]"
                              : "text-[var(--color-text-muted)]"
                          }`}
                        >
                          {log.timestamp || "unknown"}
                        </span>
                        <span
                          className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono ${
                            log.isError ? "text-[var(--color-red)]" : ""
                          }`}
                        >
                          {log.summary}
                        </span>
                      </div>
                    </summary>
                    <div
                      className={`mt-2 border-t pt-2 font-mono whitespace-pre-wrap break-words ${
                        log.isError
                          ? "border-[var(--color-red)]/20 text-[var(--color-red)]"
                          : "border-[var(--color-border)]/40 text-[var(--color-text)]"
                      }`}
                    >
                      {log.fullText}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
