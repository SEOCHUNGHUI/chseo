import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { wsUrl } from "../api/client";
import "./TerminalPage.css";

interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
}

const STORAGE_KEY = "arcturus_ssh_servers";

function loadServers(): ServerProfile[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveServers(servers: ServerProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

const EMPTY_FORM = { name: "", host: "", port: "22", username: "" };

export default function TerminalPage() {
  const [servers, setServers] = useState<ServerProfile[]>(loadServers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingServer, setPendingServer] = useState<ServerProfile | null>(null);
  const [password, setPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const termAreaRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  function saveServer() {
    if (!form.host || !form.username) return;
    const server: ServerProfile = {
      id: Date.now().toString(),
      name: form.name || `${form.username}@${form.host}`,
      host: form.host,
      port: parseInt(form.port) || 22,
      username: form.username,
    };
    const updated = [...servers, server];
    setServers(updated);
    saveServers(updated);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function removeServer(id: string) {
    const updated = servers.filter((s) => s.id !== id);
    setServers(updated);
    saveServers(updated);
    if (connectedId === id) disconnect();
    if (selectedId === id) setSelectedId(null);
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    setConnectedId(null);
    setStatusMsg("");
  }

  function openPasswordModal(server: ServerProfile) {
    setSelectedId(server.id);
    setPendingServer(server);
    setPassword("");
    setShowPasswordModal(true);
  }

  function confirmConnect() {
    if (!pendingServer) return;
    setShowPasswordModal(false);
    connectSsh(pendingServer, password);
    setPassword("");
  }

  function connectSsh(server: ServerProfile, pw: string) {
    if (!termAreaRef.current) return;

    // 기존 연결 정리
    wsRef.current?.close();
    termRef.current?.dispose();

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      theme: { background: "#0a0e14", foreground: "#e7ecf3", cursor: "#3b82f6" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termAreaRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => {
      fit.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }));
      }
    };
    window.addEventListener("resize", onResize);

    setStatusMsg("연결 중…");

    const ws = new WebSocket(wsUrl("/ws/ssh"));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ host: server.host, port: server.port, username: server.username, password: pw }));
      setTimeout(() => { fit.fit(); onResize(); }, 80);
    };

    ws.onmessage = (ev) => {
      if (connectedId !== server.id) setConnectedId(server.id);
      setStatusMsg("");
      if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      } else {
        term.write(ev.data as string);
      }
    };

    ws.onclose = () => {
      term.writeln("\r\n\x1b[31m연결 종료\x1b[0m");
      setConnectedId(null);
      setStatusMsg("");
      window.removeEventListener("resize", onResize);
    };

    ws.onerror = () => {
      term.writeln("\r\n\x1b[31m연결 오류\x1b[0m");
      setStatusMsg("");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });
  }

  const connectedServer = servers.find((s) => s.id === connectedId);

  return (
    <div className="terminal-page">
      {/* 좌측 서버 목록 */}
      <div className="ssh-sidebar">
        <div className="ssh-sidebar-header">
          <span>SSH 서버</span>
          <button type="button" className="btn-sm" onClick={() => setShowForm((v) => !v)}>
            + 추가
          </button>
        </div>

        {showForm && (
          <div className="ssh-form">
            <input
              placeholder="이름 (선택)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder="IP / 호스트 *"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            />
            <div className="form-row">
              <input
                placeholder="포트"
                value={form.port}
                style={{ width: "70px" }}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              />
              <input
                placeholder="사용자명 *"
                value={form.username}
                style={{ flex: 1 }}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && saveServer()}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn-primary-sm" onClick={saveServer}>
                저장
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="ssh-server-list">
          {servers.length === 0 && (
            <div className="ssh-empty">
              저장된 서버가 없습니다.
              <br />+ 추가를 눌러 등록하세요.
            </div>
          )}
          {servers.map((s) => (
            <div
              key={s.id}
              className={`ssh-row ${selectedId === s.id ? "selected" : ""} ${connectedId === s.id ? "connected" : ""}`}
            >
              <button
                type="button"
                className="ssh-row-info"
                onClick={() => openPasswordModal(s)}
              >
                <span className="ssh-name">{s.name}</span>
                <span className="ssh-addr">
                  {s.username}@{s.host}:{s.port}
                </span>
                {connectedId === s.id && <span className="ssh-badge">연결됨</span>}
              </button>
              <button
                type="button"
                className="btn-remove"
                onClick={() => removeServer(s.id)}
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {connectedServer && (
          <div className="ssh-footer">
            <span className="ssh-footer-label">{connectedServer.name}</span>
            <button type="button" className="btn-danger-sm" onClick={disconnect}>
              연결 해제
            </button>
          </div>
        )}
      </div>

      {/* 우측 터미널 */}
      <div className="ssh-terminal-wrap">
        {!connectedId && (
          <div className="ssh-placeholder">
            {statusMsg || "서버를 선택해 SSH 접속하세요."}
          </div>
        )}
        <div
          ref={termAreaRef}
          className="ssh-xterm"
          style={{ display: connectedId ? "block" : "none" }}
        />
      </div>

      {/* 비밀번호 모달 */}
      {showPasswordModal && pendingServer && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>SSH 접속</h3>
            <p className="modal-target">
              {pendingServer.username}@{pendingServer.host}:{pendingServer.port}
            </p>
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmConnect()}
            />
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={confirmConnect}>
                접속
              </button>
              <button type="button" className="btn-sm" onClick={() => setShowPasswordModal(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
