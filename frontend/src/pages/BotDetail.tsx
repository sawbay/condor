import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Circle } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { BotTradeHistory } from "@/components/bots/BotTradeHistory";
import { useServer } from "@/hooks/useServer";
import { api } from "@/lib/api";

export function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const { server } = useServer();

  const { data, isLoading, error } = useQuery({
    queryKey: ["bot", server, id],
    queryFn: () => api.getBot(server!, id!),
    enabled: !!server && !!id,
    refetchInterval: 10000,
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

  const { bot, config, performance } = data;
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
    </div>
  );
}
