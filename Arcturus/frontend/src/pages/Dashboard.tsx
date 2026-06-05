import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import ContainersPage from "./ContainersPage";
import DBEditorPage from "./DBEditorPage";
import FileTransferPage from "./FileTransferPage";
import MemoPage from "./MemoPage";
import TerminalPage from "./TerminalPage";
import type { User } from "../types";
import "./Dashboard.css";

type Page = "containers" | "terminal" | "db" | "filetransfer" | "memo";

interface HostStats {
  cpu_percent: number;
  mem_used: number;
  mem_total: number;
  mem_percent: number;
  disk_used: number;
  disk_total: number;
  disk_percent: number;
}

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)}G`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)}M`;
  return `${(b / 1024).toFixed(0)}K`;
}

function StatBar({ percent }: { percent: number }) {
  const color =
    percent >= 90 ? "var(--danger)" : percent >= 70 ? "var(--warning)" : "var(--success)";
  return (
    <span className="stat-bar-wrap">
      <span className="stat-bar-fill" style={{ width: `${percent}%`, background: color }} />
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("terminal");
  const [hostStats, setHostStats] = useState<HostStats | null>(null);

  useEffect(() => {
    apiFetch<User>("/api/auth/me")
      .then(setUser)
      .catch(() => navigate("/login"));
  }, [navigate]);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const data = await apiFetch<HostStats>("/api/system/host");
        if (alive) setHostStats(data);
      } catch {}
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  function logout() {
    setToken(null);
    navigate("/login");
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">Arcturus</div>

        {hostStats && (
          <div className="host-stats">
            <div className="stat-item">
              <span className="stat-label">CPU</span>
              <StatBar percent={hostStats.cpu_percent} />
              <span className="stat-value">{hostStats.cpu_percent}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">RAM</span>
              <StatBar percent={hostStats.mem_percent} />
              <span className="stat-value">
                {fmtBytes(hostStats.mem_used)}/{fmtBytes(hostStats.mem_total)}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">DISK</span>
              <StatBar percent={hostStats.disk_percent} />
              <span className="stat-value">
                {fmtBytes(hostStats.disk_used)}/{fmtBytes(hostStats.disk_total)}
              </span>
            </div>
          </div>
        )}

        <div className="topbar-right">
          <span className="user-label">{user?.username}</span>
          <button type="button" className="btn-secondary" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <div className="body">
        <nav className="nav-sidebar">
          <button
            type="button"
            className={`nav-item ${page === "terminal" ? "active" : ""}`}
            onClick={() => setPage("terminal")}
          >
            <span className="nav-icon">$</span>
            터미널
          </button>
          <button
            type="button"
            className={`nav-item ${page === "containers" ? "active" : ""}`}
            onClick={() => setPage("containers")}
          >
            <span className="nav-icon">▣</span>
            컨테이너
          </button>
          <button
            type="button"
            className={`nav-item ${page === "db" ? "active" : ""}`}
            onClick={() => setPage("db")}
          >
            <span className="nav-icon">⛁</span>
            DB 에디터
          </button>
          <button
            type="button"
            className={`nav-item ${page === "filetransfer" ? "active" : ""}`}
            onClick={() => setPage("filetransfer")}
          >
            <span className="nav-icon">⇅</span>
            파일전송
          </button>
          <button
            type="button"
            className={`nav-item ${page === "memo" ? "active" : ""}`}
            onClick={() => setPage("memo")}
          >
            <span className="nav-icon">✎</span>
            메모
          </button>
        </nav>
        <main className="content">
          {page === "terminal" && <TerminalPage />}
          {page === "containers" && <ContainersPage />}
          {page === "db" && <DBEditorPage />}
          {page === "filetransfer" && <FileTransferPage />}
          {page === "memo" && <MemoPage />}
        </main>
      </div>
    </div>
  );
}
