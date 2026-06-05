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

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("terminal");

  useEffect(() => {
    apiFetch<User>("/api/auth/me")
      .then(setUser)
      .catch(() => navigate("/login"));
  }, [navigate]);

  function logout() {
    setToken(null);
    navigate("/login");
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">Arcturus</div>
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
