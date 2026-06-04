import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import ContainerList from "../components/ContainerList";
import LogViewer from "../components/LogViewer";
import Terminal from "../components/Terminal";
import type { Container, User } from "../types";
import "./Dashboard.css";

type Tab = "logs" | "terminal";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("logs");
  const [terminalMode, setTerminalMode] = useState<"container" | "host">("container");

  const loadContainers = useCallback(async () => {
    const data = await apiFetch<Container[]>("/api/containers");
    setContainers(data);
    setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
  }, []);

  useEffect(() => {
    apiFetch<User>("/api/auth/me").then(setUser).catch(() => navigate("/login"));
    loadContainers().catch(console.error);
    const interval = setInterval(() => loadContainers().catch(console.error), 10000);
    return () => clearInterval(interval);
  }, [loadContainers, navigate]);

  function logout() {
    setToken(null);
    navigate("/login");
  }

  const selected = containers.find((c) => c.id === selectedId);

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">Arcturus</div>
        <div className="topbar-right">
          <span className="user">{user?.username}</span>
          <button type="button" className="btn-secondary" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <ContainerList
            containers={containers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefresh={() => loadContainers().catch(console.error)}
          />
        </aside>
        <main className="main">
          <div className="main-toolbar">
            <span className="selected-name">
              {selected ? selected.name : "선택 없음"}
            </span>
            <div className="tabs">
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
                터미널
              </button>
            </div>
            {tab === "terminal" && (
              <div className="term-mode">
                <button
                  type="button"
                  className={terminalMode === "container" ? "active" : ""}
                  onClick={() => setTerminalMode("container")}
                >
                  컨테이너 exec
                </button>
                <button
                  type="button"
                  className={terminalMode === "host" ? "active" : ""}
                  onClick={() => setTerminalMode("host")}
                >
                  패널 셸
                </button>
              </div>
            )}
          </div>
          <div className="main-content">
            {tab === "logs" ? (
              <LogViewer containerId={selectedId} />
            ) : (
              <Terminal
                containerId={selectedId}
                mode={terminalMode}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
