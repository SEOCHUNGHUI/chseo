import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import LogViewer from "../components/LogViewer";
import Terminal from "../components/Terminal";
import type { Container } from "../types";
import "./ContainersPage.css";

type DetailTab = "logs" | "terminal";

interface ContainerStat {
  id: string;
  cpu_percent: number;
  mem_usage: number;
  mem_limit: number;
}

function fmtMem(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}G`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}M`;
  if (bytes > 0) return `${(bytes / 1024).toFixed(0)}K`;
  return "-";
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stats, setStats] = useState<Record<string, ContainerStat>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("logs");
  const [isLoading, setIsLoading] = useState(true);

  const loadContainers = useCallback(async () => {
    const data = await apiFetch<Container[]>("/api/containers");
    setContainers(data);
    setIsLoading(false);
    setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<ContainerStat[]>("/api/system/container-stats");
      const map: Record<string, ContainerStat> = {};
      data.forEach((s) => { map[s.id] = s; });
      setStats(map);
    } catch {}
  }, []);

  useEffect(() => {
    loadContainers().catch(console.error);
    const t1 = setInterval(() => loadContainers().catch(console.error), 10000);
    return () => clearInterval(t1);
  }, [loadContainers]);

  useEffect(() => {
    loadStats();
    const t2 = setInterval(loadStats, 10000);
    return () => clearInterval(t2);
  }, [loadStats]);

  async function action(id: string, act: "start" | "stop" | "restart") {
    try {
      await apiFetch(`/api/containers/${id}/${act}`, { method: "POST" });
      await loadContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  }

  const selected = containers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="containers-page">
      <div className="ct-table-wrap">
        <div className="ct-table-header">
          <span>컨테이너 목록</span>
          <button
            type="button"
            className="btn-sm"
            onClick={() => { loadContainers().catch(console.error); loadStats(); }}
          >
            새로고침
          </button>
        </div>
        <div className="ct-table">
          {/* 헤더를 스크롤 영역 안에 sticky로 배치 → 행과 동일한 너비 보장 */}
          <div className="ct-col-header">
            <span>Name</span>
            <span>ID</span>
            <span>Image</span>
            <span>Port</span>
            <span>CPU</span>
            <span>MEM</span>
            <span>Status</span>
            <span></span>
          </div>
          {isLoading && (
            <div className="ct-empty">컨테이너를 조회하고 있습니다.</div>
          )}
          {!isLoading && containers.length === 0 && (
            <div className="ct-empty">컨테이너가 없습니다.</div>
          )}
          {containers.map((c) => {
            const s = stats[c.id];
            return (
              <div
                key={c.id}
                className={`ct-row ${selectedId === c.id ? "selected" : ""}`}
                onClick={() => setSelectedId(c.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedId(c.id)}
                role="button"
                tabIndex={0}
              >
                <span className="ct-name">{c.name}</span>
                <span className="ct-id">{c.id}</span>
                <span className="ct-image">{c.image}</span>
                <span className="ct-ports">{c.ports}</span>
                <span className="ct-cpu">
                  {c.status === "running" && s ? `${s.cpu_percent}%` : "-"}
                </span>
                <span className="ct-mem">
                  {c.status === "running" && s ? fmtMem(s.mem_usage) : "-"}
                </span>
                <span className={`ct-status status-${c.status}`}>{c.status}</span>
                <div
                  className="ct-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button type="button" className="btn-sm" onClick={() => action(c.id, "start")}>시작</button>
                  <button type="button" className="btn-sm" onClick={() => action(c.id, "stop")}>중지</button>
                  <button type="button" className="btn-sm" onClick={() => action(c.id, "restart")}>재시작</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="detail-panel">
        <div className="detail-tabs">
          <span className="detail-title">
            {selected ? selected.name : "컨테이너를 선택하세요"}
          </span>
          {selected && (
            <>
              <button
                type="button"
                className={tab === "logs" ? "active" : ""}
                onClick={() => setTab("logs")}
              >
                로그
              </button>
              <button
                type="button"
                className={tab === "terminal" ? "active" : ""}
                onClick={() => setTab("terminal")}
              >
                터미널 exec
              </button>
            </>
          )}
        </div>
        <div className="detail-content">
          {tab === "logs" ? (
            <LogViewer containerId={selectedId} />
          ) : (
            <Terminal containerId={selectedId} mode="container" />
          )}
        </div>
      </div>
    </div>
  );
}
