import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import LogViewer from "../components/LogViewer";
import Terminal from "../components/Terminal";
import type { Container } from "../types";
import "./ContainersPage.css";

type DetailTab = "logs" | "terminal";

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("logs");

  const loadContainers = useCallback(async () => {
    const data = await apiFetch<Container[]>("/api/containers");
    setContainers(data);
    setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
  }, []);

  useEffect(() => {
    loadContainers().catch(console.error);
    const interval = setInterval(() => loadContainers().catch(console.error), 10000);
    return () => clearInterval(interval);
  }, [loadContainers]);

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
            onClick={() => loadContainers().catch(console.error)}
          >
            새로고침
          </button>
        </div>
        <div className="ct-table">
          {containers.length === 0 && (
            <div className="ct-empty">컨테이너가 없습니다.</div>
          )}
          {containers.map((c) => (
            <div
              key={c.id}
              className={`ct-row ${selectedId === c.id ? "selected" : ""}`}
              onClick={() => setSelectedId(c.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(c.id)}
              role="button"
              tabIndex={0}
            >
              <span className="ct-name">{c.name}</span>
              <span className="ct-image">{c.image}</span>
              <span className={`badge status-${c.status}`}>{c.status}</span>
              <div
                className="ct-actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => action(c.id, "start")}
                >
                  시작
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => action(c.id, "stop")}
                >
                  중지
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => action(c.id, "restart")}
                >
                  재시작
                </button>
              </div>
            </div>
          ))}
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
