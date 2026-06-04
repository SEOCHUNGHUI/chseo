import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import ContainersPage from "./ContainersPage";
import TerminalPage from "./TerminalPage";
import type { User } from "../types";
import "./Dashboard.css";

type Page = "containers" | "terminal";

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
        </nav>
        <main className="content">
          {page === "containers" ? <ContainersPage /> : <TerminalPage />}
        </main>
      </div>
    </div>
  );
}
