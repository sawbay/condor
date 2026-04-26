import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

const PAGE_SIZE = 20;

function formatTimestamp(value: number): string {
  if (!value) return "unknown";
  return new Date(value).toLocaleString();
}

function formatQuote(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(4);
}

function formatQuantity(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.endsWith(".")) return `${value}0`;
  return value;
}

export function BotTradeHistory({
  server,
  botId,
}: {
  server: string;
  botId: string;
}) {
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [refreshAnchor, setRefreshAnchor] = useState<number | null>(null);
  const refreshIntervalMs = 10000;

  useEffect(() => {
    setPage(0);
  }, [botId, server]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  useEffect(() => {
    if (autoRefresh) {
      setRefreshAnchor(Date.now());
      return;
    }
    setRefreshAnchor(null);
  }, [autoRefresh]);

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["bot-history", server, botId, page],
    queryFn: () =>
      api.getBotHistory(server, botId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        days: 0,
        verbose: true,
        timeout: 60,
    }),
    enabled: !!server && !!botId,
    refetchInterval: autoRefresh ? 10000 : false,
    placeholderData: keepPreviousData,
  });

  const trades = data?.trades ?? [];
  const sortedTrades = [...trades].sort((a, b) => {
    const aTs = a.trade_timestamp ?? 0;
    const bTs = b.trade_timestamp ?? 0;
    if (aTs !== bTs) return bTs - aTs;
    return (b.trade_id || "").localeCompare(a.trade_id || "");
  });
  const totalCount = data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canGoPrev = page > 0;
  const canGoNext = page < totalPages - 1;
  const pageWindow = (() => {
    if (totalPages <= 1) return [0];
    if (page <= 0) return [0, 1];
    if (page >= totalPages - 1) return [totalPages - 2, totalPages - 1];
    return [page, page + 1];
  })();

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (autoRefresh && dataUpdatedAt) {
      setRefreshAnchor(dataUpdatedAt);
    }
  }, [autoRefresh, dataUpdatedAt]);

  const countdownSeconds =
    autoRefresh && refreshAnchor
      ? Math.max(0, Math.ceil((refreshIntervalMs - (now - refreshAnchor)) / 1000))
      : null;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-[var(--color-text-muted)]">Trade History</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{totalCount} trades total</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh trades
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

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading history...
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--color-red)]">
          {error instanceof Error ? error.message : "Failed to load history"}
        </p>
      ) : trades.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No trade history found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--color-text-muted)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Market</th>
                <th className="py-2 pr-4 font-medium">Symbol</th>
                <th className="py-2 pr-4 font-medium">Side</th>
                <th className="py-2 pr-4 font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">Qty</th>
                <th className="py-2 pr-4 font-medium">Fee</th>
                <th className="py-2 pr-4 font-medium">Trade ID</th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map((trade) => (
                <tr
                  key={trade.trade_id || `${trade.trade_timestamp}-${trade.symbol}-${trade.trade_type}`}
                  className="border-b border-[var(--color-border)]/60 last:border-0"
                >
                  <td className="py-2 pr-4 font-mono text-xs">
                    {formatTimestamp(trade.trade_timestamp)}
                  </td>
                  <td className="py-2 pr-4">{trade.market}</td>
                  <td className="py-2 pr-4">{trade.symbol}</td>
                  <td className="py-2 pr-4">{trade.trade_type}</td>
                  <td className="py-2 pr-4 font-mono">{trade.price}</td>
                  <td className="py-2 pr-4 font-mono">{formatQuantity(trade.quantity)}</td>
                  <td className="py-2 pr-4 font-mono">
                    {formatQuote(trade.trade_fee_in_quote)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{trade.trade_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-3">
        <div>
          <span className="block text-xs text-[var(--color-text-muted)]">
            Page {page + 1} of {totalPages}
          </span>
          <span className="block text-xs text-[var(--color-text-muted)]">
            Showing {sortedTrades.length} rows
          </span>
        </div>
        <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-0.5 py-0.5">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!canGoPrev || isLoading}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <div className="mx-1 flex min-w-12 items-center justify-center gap-0.5 px-0.5">
            {pageWindow.map((pageIndex) => {
              const active = pageIndex === page;
              return (
                <button
                  key={pageIndex}
                  type="button"
                  className={`min-w-6 rounded-md px-1.5 py-0.5 text-xs transition-colors ${
                    active
                      ? "bg-[var(--color-surface)] font-semibold text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                  }`}
                  onClick={() => setPage(pageIndex)}
                  disabled={isLoading}
                >
                  {pageIndex + 1}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={!canGoNext || isLoading}
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
