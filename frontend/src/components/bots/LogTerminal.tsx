import { useEffect, useRef } from "react";

type LogEntry = {
  timestamp: string;
  summary: string;
  fullText: string;
  isError: boolean;
};

interface LogTerminalProps {
  logs: LogEntry[];
  title?: string;
}

export function LogTerminal({ logs, title = "Live Activity Log" }: LogTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full rounded-lg border border-[var(--color-border)] terminal-bg overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-[var(--color-border)]/50">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
          <span className="ml-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-widest">
            {title}
          </span>
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
          {logs.length} entries
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin"
      >
        {logs.length === 0 ? (
          <div className="text-[var(--color-text-muted)] text-sm font-mono animate-pulse">
            Waiting for logs...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div 
              key={idx} 
              className={`flex gap-3 text-xs font-mono leading-relaxed group transition-colors hover:bg-white/5 p-0.5 rounded`}
            >
              <span className="text-[var(--color-text-muted)] shrink-0 select-none opacity-60">
                [{log.timestamp || "00:00:00"}]
              </span>
              <span className={`${log.isError ? "text-red-400" : "text-gray-300"} break-all`}>
                {log.summary}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
