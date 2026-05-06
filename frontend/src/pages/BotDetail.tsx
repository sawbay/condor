import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Circle, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { BotTradeHistory } from "@/components/bots/BotTradeHistory";
import { LogTerminal } from "@/components/bots/LogTerminal";
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
  const wsRef = useRef<WebSocket | null>(null);
  const [refreshAnchor, setRefreshAnchor] = useState<number | null>(null);
  const refreshIntervalMs = 10000;
  
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectDelay = 30000;

  // WebSocket for deployment and status monitoring
  useEffect(() => {
    if (!id) return;

    // Use Basic Auth credentials in the URL as requested
    // Use Authorization Header approach as requested
    const wsUrl = `wss://humming-api2.sawbay.net/ws/executors`;

    const establishConnection = () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }

      console.log(`[WS] Connecting to ${wsUrl} (Attempt ${reconnectAttempts.current + 1})`);
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setupHandlers(ws);
      } catch (err) {
        console.error("[WS] Failed to create WebSocket:", err);
        handleReconnect();
      }
    };

    const handleReconnect = () => {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), maxReconnectDelay);
      console.log(`[WS] Reconnecting in ${delay}ms...`);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectAttempts.current++;
        establishConnection();
      }, delay);
    };

    const setupHandlers = (websocket: WebSocket) => {
      websocket.onopen = () => {
        console.log("[WS] Connected. Authenticating...");
        reconnectAttempts.current = 0; // Reset attempts on success
        
        websocket.send(JSON.stringify({
          action: "authenticate",
          username: "admin",
          password: "admin"
        }));

        console.log(`[WS] Subscribing to deployment for: ${id}`);
        websocket.send(JSON.stringify({
          action: "subscribe",
          type: "bot_deployment",
          instance_name: id,
          update_interval: 2.0
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "bot_deployment_resolved") {
            websocket.send(JSON.stringify({
              action: "subscribe",
              type: "bot_status",
              bot_name: id
            }));
          }

          if (msg.type === "bot_status_update" || msg.type === "bot_status") {
            const status = msg.status || msg.data?.status;
            const performance = msg.performance || msg.data?.performance;
            
            if (status || performance) {
              queryClient.setQueryData(["bot", server, id], (old: any) => {
                if (!old) return old;
                return { 
                  ...old, 
                  bot: { ...old.bot, status: status ?? old.bot.status },
                  performance: performance ?? old.performance
                };
              });
            }
          }
        } catch (err) {
          console.error("[WS] Error parsing message:", err);
        }
      };

      websocket.onerror = (err) => {
        console.error("[WS] WebSocket error:", err);
      };

      websocket.onclose = (event) => {
        console.log(`[WS] WebSocket closed (code: ${event.code})`);
        if (event.code !== 1000 && event.code !== 1001) {
          handleReconnect();
        }
      };
    };

    establishConnection();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      const currentWs = wsRef.current;
      if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
        currentWs.close(1000, "Component unmounted");
      }
      wsRef.current = null;
    };
  }, [id]);

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["bot", server, id],
    queryFn: () => api.getBot(server!, id!),
    enabled: !!server && !!id,
    refetchInterval: autoRefresh ? 10000 : false,
  });
  const containerName = data?.bot.name ?? id;
  const {
    data: containerStatus,
    isFetching: isFetchingContainer,
  } = useQuery({
    queryKey: ["bot-container", server, containerName],
    queryFn: () => api.getBotContainer(server!, containerName!),
    enabled: !!server && !!containerName,
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
    void queryClient.invalidateQueries({ queryKey: ["bot-container", server, containerName] });
    void queryClient.invalidateQueries({ queryKey: ["bots", server] });
  };


  const startContainerMutation = useMutation({
    mutationFn: () => api.startBotContainer(server!, containerName!),
    onSuccess: invalidateBotData,
  });

  const stopContainerMutation = useMutation({
    mutationFn: () => api.stopBotContainer(server!, containerName!),
    onSuccess: invalidateBotData,
  });


  const { bot, config, performance, general_logs, error_logs } = data ?? {
    bot: { name: id, status: "unknown" },
    config: {},
    performance: {},
    general_logs: [],
    error_logs: [],
  };
  const perfRecord = performance as Record<string, any>;
  const perfEntries = Object.entries(perfRecord);
  
  // Separate scalars from controllers
  const scalarPerformanceEntries = perfEntries.filter(([, value]) => {
    return value === null || typeof value !== "object" || Array.isArray(value);
  });
  const controllerPerformanceEntries = perfEntries.filter(([, value]) => {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  });

  // Calculate totals from controllers if needed
  const totals = useMemo(() => {
    let globalPnl = 0;
    let totalVolume = 0;
    controllerPerformanceEntries.forEach(([, controllerData]) => {
      const perf = (controllerData as any).performance || {};
      globalPnl += Number(perf.global_pnl_quote || 0);
      totalVolume += Number(perf.volume_traded || 0);
    });
    return { globalPnl, totalVolume };
  }, [controllerPerformanceEntries]);

  // Extract all active positions
  const allPositions = useMemo(() => {
    const positions: any[] = [];
    controllerPerformanceEntries.forEach(([controllerName, controllerData]) => {
      const perf = (controllerData as any).performance || {};
      const positionsSummary = perf.positions_summary || [];
      positionsSummary.forEach((pos: any) => {
        positions.push({
          ...pos,
          controllerName,
        });
      });
    });
    return positions;
  }, [controllerPerformanceEntries]);

  // Merge totals into scalar display if scalar list is sparse
  const displayPerformance = [...scalarPerformanceEntries];
  if (controllerPerformanceEntries.length > 0) {
    displayPerformance.unshift(["Total Volume", totals.totalVolume.toFixed(2)]);
    displayPerformance.unshift(["Global PnL", totals.globalPnl.toFixed(2)]);
  }

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
  const statusColor =
    bot.status === "running"
      ? "text-[var(--color-green)] glow-text-green"
      : "text-[var(--color-red)] glow-text-red";
  const containerStatusColor = containerStatus?.is_running
    ? "text-[var(--color-green)]"
    : containerStatus?.exists
      ? "text-[var(--color-yellow)]"
      : "text-[var(--color-red)]";
  const isContainerRunning = Boolean(containerStatus?.is_running);
  const isContainerActionPending = startContainerMutation.isPending || stopContainerMutation.isPending;

  const parsedLogs = [
    ...error_logs.map((log) => ({ ...parseLogEntry(log), isError: true })),
    ...general_logs.map((log) => parseLogEntry(log)),
  ].sort((a, b) => a.sortKey - b.sortKey);
  const countdownSeconds =
    autoRefresh && refreshAnchor
      ? Math.max(0, Math.ceil((refreshIntervalMs - (now - refreshAnchor)) / 1000))
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/bots"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to bots
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((value) => !value)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-all ${
              autoRefresh
                ? "border-[var(--color-green)]/40 bg-[var(--color-green)]/10 text-[var(--color-green)] glow-text-green"
                : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
            }`}
          >
            Auto {autoRefresh ? `(${countdownSeconds ?? 0}s)` : "off"}
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-all active:scale-95"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Metrics & Controls */}
        <div className="w-full lg:w-1/3 space-y-6 shrink-0">
          <div className="glass rounded-xl p-6 space-y-4 shadow-xl border-white/5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">{bot.name}</h2>
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${statusColor}`}>
                <Circle className="h-2 w-2 fill-current animate-pulse" />
                {bot.status}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${containerStatusColor} border-white/5 bg-white/5`}
              >
                {isFetchingContainer ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-1.5 w-1.5 fill-current" />}
                {containerStatus?.status ?? "unknown"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => startContainerMutation.mutate()}
                disabled={isContainerRunning || isContainerActionPending || !containerStatus?.exists}
                className="flex items-center justify-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 py-2.5 text-xs font-bold text-green-500 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Play className="h-3 w-3 fill-current" /> START
              </button>
              <button
                type="button"
                onClick={() => stopContainerMutation.mutate()}
                disabled={!isContainerRunning || isContainerActionPending}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 py-2.5 text-xs font-bold text-red-500 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Square className="h-3 w-3 fill-current" /> STOP
              </button>
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4 border-white/5">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
              Performance Summary
            </h3>
            <div className="space-y-4">
              {displayPerformance.length > 0 ? (
                displayPerformance.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-baseline border-b border-white/5 pb-2 last:border-0">
                    <span className="text-xs text-[var(--color-text-muted)]">{k}</span>
                    <span className={`font-mono text-sm font-bold ${k.toLowerCase().includes('pnl') ? (Number(v) >= 0 ? 'text-green-400' : 'text-red-400') : ''}`}>
                      {String(v)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--color-text-muted)] italic text-center py-2">
                  No performance metrics available
                </p>
              )}
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4 border-white/5 overflow-hidden">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
              Configuration
            </h3>
            <div className="max-h-48 overflow-y-auto pr-2 scrollbar-thin">
              <dl className="space-y-3">
                {Object.entries(config).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <dt className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold">{k}</dt>
                    <dd className="font-mono text-xs break-all bg-black/20 p-2 rounded border border-white/5">
                      {String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        {/* Right Column: Live Terminal & Detailed Data */}
        <div className="flex-1 w-full space-y-6">
          <div className="h-[450px]">
            <LogTerminal logs={parsedLogs} />
          </div>

          {controllerPerformanceEntries.length > 0 && (
            <div className="glass rounded-xl p-6 border-white/5 overflow-hidden">
              <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4">
                Active Controllers
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold">
                      <th className="pb-2 px-2">Controller</th>
                      <th className="pb-2 px-2">Status</th>
                      <th className="pb-2 px-2 text-right">PnL</th>
                      <th className="pb-2 px-2 text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controllerPerformanceEntries.map(([controllerName, controllerData]) => {
                      const ctrl = controllerData as Record<string, unknown>;
                      const nestedPerf = (ctrl.performance ?? {}) as Record<string, unknown>;
                      const pnl = Number(nestedPerf.global_pnl_quote ?? 0);
                      return (
                        <tr key={controllerName} className="bg-white/5 hover:bg-white/10 transition-colors group">
                          <td className="py-3 px-3 rounded-l-lg font-bold">{controllerName}</td>
                          <td className="py-3 px-3">
                            <span className="text-xs opacity-70 group-hover:opacity-100 transition-opacity">
                              {String(ctrl.status ?? "unknown")}
                            </span>
                          </td>
                          <td className={`py-3 px-3 text-right font-mono font-bold ${pnl >= 0 ? "text-green-400 glow-text-green" : "text-red-400 glow-text-red"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 rounded-r-lg text-right font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                            {Number(nestedPerf.volume_traded ?? 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {allPositions.length > 0 && (
            <div className="glass rounded-xl p-6 border-white/5 overflow-hidden">
              <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4">
                Open Positions
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold">
                      <th className="pb-2 px-2">Side</th>
                      <th className="pb-2 px-2">Symbol</th>
                      <th className="pb-2 px-2 text-right">Amount</th>
                      <th className="pb-2 px-2 text-right">Entry</th>
                      <th className="pb-2 px-2 text-right">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPositions.map((pos, idx) => {
                      const pnl = Number(pos.unrealized_pnl_quote ?? 0);
                      const side = pos.side?.split('.').pop() ?? 'UNKNOWN';
                      return (
                        <tr key={`${pos.trading_pair}-${idx}`} className="bg-white/5 hover:bg-white/10 transition-colors group">
                          <td className={`py-3 px-3 rounded-l-lg font-bold text-[10px] ${side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                            {side}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <span className="font-bold">{pos.trading_pair}</span>
                              <span className="text-[10px] text-[var(--color-text-muted)] opacity-50">{pos.controllerName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            {Number(pos.amount).toFixed(6)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                            {Number(pos.breakeven_price).toFixed(2)}
                          </td>
                          <td className={`py-3 px-3 rounded-r-lg text-right font-mono font-bold ${pnl >= 0 ? "text-green-400 glow-text-green" : "text-red-400 glow-text-red"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="glass rounded-xl p-6 border-white/5">
            <BotTradeHistory server={server} botId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
