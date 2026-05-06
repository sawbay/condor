import { Bot, Code2, FileText, FlaskConical, History, Loader2 } from "lucide-react";
import { lazy, Suspense, useRef } from "react";
import { useSearchParams } from "react-router-dom";

const ActiveBotsTab = lazy(() =>
  import("@/pages/tabs/ActiveBotsTab").then((m) => ({ default: m.ActiveBotsTab })),
);
const ControllersTab = lazy(() =>
  import("@/pages/tabs/ControllersTab").then((m) => ({ default: m.ControllersTab })),
);
const ConfigsTab = lazy(() =>
  import("@/pages/tabs/ConfigsTab").then((m) => ({ default: m.ConfigsTab })),
);
const BotRunsTab = lazy(() =>
  import("@/pages/tabs/BotRunsTab").then((m) => ({ default: m.BotRunsTab })),
);
const BacktestingTab = lazy(() =>
  import("@/pages/tabs/BacktestingTab").then((m) => ({ default: m.BacktestingTab })),
);

const TABS = [
  { key: "active", label: "Active", icon: Bot },
  { key: "controllers", label: "Controllers", icon: Code2 },
  { key: "configs", label: "Configs", icon: FileText },
  { key: "runs", label: "Runs", icon: History },
  { key: "backtest", label: "Backtest", icon: FlaskConical },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function FallbackSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" />
    </div>
  );
}

export function Bots() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const currentTab =
    requestedTab === "archived"
      ? "runs"
      : TABS.some((tab) => tab.key === requestedTab)
        ? (requestedTab as TabKey)
        : "active";
  const visitedRef = useRef<Set<TabKey>>(new Set([currentTab]));
  visitedRef.current.add(currentTab);

  const setTab = (tab: TabKey) => {
    if (tab === "active") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex w-fit items-center gap-1 rounded-none border border-[var(--color-border)] ghost-panel bg-transparent p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-none px-3 py-1.5 text-sm font-medium transition-colors ${
              currentTab === key
                ? "bg-[var(--color-bg)] text-[var(--color-text)] shadow-none"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <Suspense fallback={<FallbackSpinner />}>
        {visitedRef.current.has("active") && (
          <div style={{ display: currentTab === "active" ? undefined : "none" }}>
            <ActiveBotsTab />
          </div>
        )}
        {visitedRef.current.has("controllers") && (
          <div style={{ display: currentTab === "controllers" ? undefined : "none" }}>
            <ControllersTab />
          </div>
        )}
        {visitedRef.current.has("configs") && (
          <div style={{ display: currentTab === "configs" ? undefined : "none" }}>
            <ConfigsTab />
          </div>
        )}
        {visitedRef.current.has("runs") && (
          <div style={{ display: currentTab === "runs" ? undefined : "none" }}>
            <BotRunsTab />
          </div>
        )}
        {visitedRef.current.has("backtest") && (
          <div style={{ display: currentTab === "backtest" ? undefined : "none" }}>
            <BacktestingTab />
          </div>
        )}
      </Suspense>
    </div>
  );
}
