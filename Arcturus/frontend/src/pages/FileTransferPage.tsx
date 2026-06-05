import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "../api/client";
import "./FileTransferPage.css";

const STORAGE_KEY = "arcturus_ssh_servers";

interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
}

interface FileEntry {
  name: string;
  size: number;
  mtime: number;
  is_dir: boolean;
  is_link: boolean;
  permissions: string;
}

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface Creds {
  host: string;
  port: number;
  username: string;
  password: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(ts: number): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function pathJoin(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/") || "/";
}

function pathUp(p: string): string {
  const parts = p.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") || "/";
}

const EMPTY_FORM = { name: "", host: "", port: "22", username: "" };

function loadServers(): ServerProfile[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveServers(list: ServerProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function FileTransferPage() {
  // ── SSH 서버 목록 (localStorage) ──
  const [servers, setServers] = useState<ServerProfile[]>(loadServers);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingServer, setPendingServer] = useState<ServerProfile | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [connectError, setConnectError] = useState("");

  // ── 서버 추가 폼 ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // ── 원격 브라우저 ──
  const [remotePath, setRemotePath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isLoadingDir, setIsLoadingDir] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // ── 새 폴더 ──
  const [showMkdir, setShowMkdir] = useState(false);
  const [mkdirName, setMkdirName] = useState("");

  // ── 이름 바꾸기 ──
  const [renamingEntry, setRenamingEntry] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── 업로드 ──
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addServer() {
    if (!form.host || !form.username) return;
    const newServer: ServerProfile = {
      id: `${Date.now()}-${Math.random()}`,
      name: form.name || `${form.username}@${form.host}`,
      host: form.host,
      port: form.port || "22",
      username: form.username,
    };
    const updated = [...servers, newServer];
    setServers(updated);
    saveServers(updated);
    setForm(EMPTY_FORM);
    setShowAddForm(false);
  }

  function removeServer(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (activeServerId === id) disconnect();
    const updated = servers.filter((s) => s.id !== id);
    setServers(updated);
    saveServers(updated);
  }

  // ── API 헬퍼 ──
  const sftp = useCallback(
    async (endpoint: string, body: object) => {
      const token = getToken();
      const res = await fetch(`/api/sftp/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? res.statusText);
      }
      return res.json();
    },
    []
  );

  // ── 디렉토리 로드 ──
  const loadDir = useCallback(
    async (path: string, c: Creds) => {
      setIsLoadingDir(true);
      setRemoteError("");
      setSelected(null);
      try {
        const data = await sftp("list", { ...c, path });
        setEntries(data.entries);
        setRemotePath(data.path);
        setPathInput(data.path);
      } catch (err) {
        setRemoteError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoadingDir(false);
      }
    },
    [sftp]
  );

  // ── 연결 ──
  async function connect(server: ServerProfile, pw: string) {
    const c: Creds = {
      host: server.host,
      port: Number(server.port),
      username: server.username,
      password: pw,
    };
    setConnectError("");
    try {
      const data = await sftp("list", { ...c, path: "/" });
      setCreds(c);
      setActiveServerId(server.id);
      setEntries(data.entries);
      setRemotePath(data.path);
      setPathInput(data.path);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
      return;
    }
    setShowPasswordModal(false);
  }

  function disconnect() {
    setCreds(null);
    setActiveServerId(null);
    setEntries([]);
    setRemotePath("/");
    setPathInput("/");
    setUploadQueue([]);
  }

  // ── 폴더 클릭 ──
  function openDir(name: string) {
    if (!creds) return;
    const next = pathJoin(remotePath, name);
    loadDir(next, creds);
  }

  // ── 경로 직접 입력 ──
  function navigateTo(e: React.KeyboardEvent) {
    if (e.key === "Enter" && creds) {
      loadDir(pathInput, creds);
    }
  }

  // ── 다운로드 ──
  async function downloadFile(name: string) {
    if (!creds) return;
    const path = pathJoin(remotePath, name);
    const token = getToken();
    try {
      const res = await fetch("/api/sftp/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...creds, path }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "다운로드 실패" }));
        alert(err.detail);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("다운로드 오류: " + String(err));
    }
  }

  // ── 삭제 ──
  async function deleteEntry(name: string) {
    if (!creds) return;
    if (!window.confirm(`"${name}" 을(를) 삭제하시겠습니까?`)) return;
    const path = pathJoin(remotePath, name);
    try {
      await sftp("delete", { ...creds, path });
      loadDir(remotePath, creds);
    } catch (err) {
      alert("삭제 실패: " + String(err));
    }
  }

  // ── 새 폴더 ──
  async function mkdir() {
    if (!creds || !mkdirName.trim()) return;
    const path = pathJoin(remotePath, mkdirName.trim());
    try {
      await sftp("mkdir", { ...creds, path });
      setShowMkdir(false);
      setMkdirName("");
      loadDir(remotePath, creds);
    } catch (err) {
      alert("폴더 생성 실패: " + String(err));
    }
  }

  // ── 이름 바꾸기 ──
  async function rename(oldName: string) {
    if (!creds || !renameValue.trim() || renameValue === oldName) {
      setRenamingEntry(null);
      return;
    }
    const old_path = pathJoin(remotePath, oldName);
    const new_path = pathJoin(remotePath, renameValue.trim());
    try {
      await sftp("rename", { ...creds, old_path, new_path });
      setRenamingEntry(null);
      loadDir(remotePath, creds);
    } catch (err) {
      alert("이름 바꾸기 실패: " + String(err));
    }
  }

  // ── 파일 선택 → 큐에 추가만 (업로드 아직 안 함) ──
  function stageFiles(files: FileList | File[]) {
    const items: UploadItem[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      status: "pending" as const,
    }));
    setUploadQueue((q) => [...q, ...items]);
  }

  // ── 실제 업로드 실행 ──
  async function startUpload() {
    if (!creds) return;
    const pending = uploadQueue.filter((x) => x.status === "pending");
    if (pending.length === 0) return;

    for (const item of pending) {
      setUploadQueue((q) =>
        q.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x))
      );
      try {
        const form = new FormData();
        form.append("host", creds.host);
        form.append("port", String(creds.port));
        form.append("username", creds.username);
        form.append("password", creds.password);
        form.append("path", remotePath);
        form.append("file", item.file);
        const token = getToken();
        const res = await fetch("/api/sftp/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "업로드 실패" }));
          throw new Error(err.detail);
        }
        setUploadQueue((q) =>
          q.map((x) => (x.id === item.id ? { ...x, status: "done" } : x))
        );
      } catch (err) {
        setUploadQueue((q) =>
          q.map((x) =>
            x.id === item.id ? { ...x, status: "error", error: String(err) } : x
          )
        );
      }
    }
    loadDir(remotePath, creds);
  }

  // ── 큐에서 개별 항목 제거 ──
  function removeFromQueue(id: string) {
    setUploadQueue((q) => q.filter((x) => x.id !== id));
  }

  // 드래그앤드롭
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (!creds) return;
    const files = e.dataTransfer.files;
    if (files.length) stageFiles(files);
  }

  // 브레드크럼
  const breadcrumbs = remotePath
    .split("/")
    .filter(Boolean)
    .reduce<{ label: string; path: string }[]>(
      (acc, seg) => {
        const prev = acc[acc.length - 1]?.path ?? "";
        acc.push({ label: seg, path: `${prev}/${seg}` });
        return acc;
      },
      []
    );

  return (
    <div className="ft-page">
      {/* ── 좌측: SSH 서버 목록 ── */}
      <div className="ft-sidebar">
        <div className="ft-sidebar-header">
          <span>SSH 서버</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowAddForm((v) => !v)}
            title="서버 추가"
          >
            +
          </button>
        </div>

        {showAddForm && (
          <div className="ft-add-form">
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
            <div className="ft-form-row">
              <input
                placeholder="포트"
                value={form.port}
                style={{ width: "55px" }}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              />
              <input
                placeholder="사용자명 *"
                value={form.username}
                style={{ flex: 1 }}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addServer()}
              />
            </div>
            <div className="ft-form-actions">
              <button type="button" className="btn-primary-sm" onClick={addServer}>
                저장
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="ft-server-list">
          {servers.length === 0 && (
            <div className="ft-empty">
              + 버튼으로 서버를 추가하세요.<br />
              <span style={{ fontSize: "0.72rem" }}>터미널 메뉴와 공유됩니다.</span>
            </div>
          )}
          {servers.map((s) => (
            <div
              key={s.id}
              className={`ft-server-row ${activeServerId === s.id ? "connected" : ""}`}
            >
              <button
                type="button"
                className="ft-server-info"
                onClick={() => {
                  setPendingServer(s);
                  setPwInput("");
                  setConnectError("");
                  setShowPasswordModal(true);
                }}
              >
                <span className="ft-server-name">{s.name}</span>
                <span className="ft-server-addr">
                  {s.username}@{s.host}:{s.port}
                </span>
                {activeServerId === s.id && (
                  <span className="ft-badge">연결됨</span>
                )}
              </button>
              <button
                type="button"
                className="btn-remove"
                onClick={(e) => removeServer(s.id, e)}
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {creds && (
          <div className="ft-sidebar-footer">
            <button type="button" className="btn-danger-sm" onClick={disconnect}>
              연결 해제
            </button>
          </div>
        )}
      </div>

      {/* ── 우측: 업로드 + 원격 브라우저 ── */}
      <div className="ft-main">
        {/* ── 업로드 패널 ── */}
        <div className="ft-upload-panel">
          <div className="ft-panel-header">
            <span>로컬 → 서버 업로드</span>
            <span className="ft-panel-path">
              {creds ? `→ ${remotePath}` : "서버 연결 후 사용 가능"}
            </span>
          </div>

          {/* 드래그앤드롭 영역 */}
          <div
            className={`ft-drop-zone ${isDragOver ? "drag-over" : ""} ${!creds ? "disabled" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (creds) setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
          >
            <div className="ft-drop-icon">⬆</div>
            <div className="ft-drop-text">
              {isDragOver ? "여기에 놓으세요" : "파일을 여기로 드래그"}
            </div>
          </div>

          {/* 파일 선택 버튼 — 항상 보임 */}
          <div className="ft-upload-btn-wrap">
            <button
              type="button"
              className="ft-upload-btn"
              disabled={!creds}
              onClick={() => fileInputRef.current?.click()}
            >
              📂 파일 선택하기
            </button>
            {!creds && (
              <span className="ft-upload-hint">서버에 먼저 연결하세요</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) stageFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* 업로드 실행 버튼 */}
          {uploadQueue.some((x) => x.status === "pending") && (
            <div className="ft-upload-action">
              <button
                type="button"
                className="ft-upload-start-btn"
                onClick={startUpload}
                disabled={!creds}
              >
                ⬆ 서버로 업로드 ({uploadQueue.filter((x) => x.status === "pending").length}개)
              </button>
              <span className="ft-upload-dest" title={remotePath}>→ {remotePath}</span>
            </div>
          )}

          <div className="ft-queue">
            {uploadQueue.length === 0 && (
              <div className="ft-queue-empty">파일을 선택하면 여기에 표시됩니다.</div>
            )}
            {uploadQueue.map((item) => (
              <div key={item.id} className={`ft-queue-item status-${item.status}`}>
                <span className="ft-queue-icon">
                  {item.status === "done" ? "✓" :
                   item.status === "error" ? "✕" :
                   item.status === "uploading" ? "↑" : "○"}
                </span>
                <span className="ft-queue-name" title={item.file.name}>
                  {item.file.name}
                </span>
                <span className="ft-queue-size">{formatSize(item.file.size)}</span>
                {item.error && (
                  <span className="ft-queue-error" title={item.error}>!</span>
                )}
                {item.status === "pending" && (
                  <button
                    type="button"
                    className="ft-queue-remove"
                    onClick={() => removeFromQueue(item.id)}
                    title="제거"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {uploadQueue.length > 0 && !uploadQueue.some((x) => x.status === "pending" || x.status === "uploading") && (
              <button
                type="button"
                className="ft-queue-clear"
                onClick={() => setUploadQueue([])}
              >
                목록 지우기
              </button>
            )}
          </div>
        </div>

        {/* ── 원격 파일 브라우저 ── */}
        <div className="ft-remote-panel">
          <div className="ft-panel-header">
            <span>원격 서버</span>
            <div className="ft-remote-actions">
              {creds && (
                <>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => loadDir(remotePath, creds)}
                    title="새로고침"
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => setShowMkdir(true)}
                    title="새 폴더"
                  >
                    + 폴더
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 경로 입력 + 브레드크럼 */}
          <div className="ft-path-bar">
            <button
              type="button"
              className="ft-path-up"
              disabled={!creds || remotePath === "/"}
              onClick={() => creds && loadDir(pathUp(remotePath), creds)}
              title="상위 폴더"
            >
              ↑
            </button>
            <input
              className="ft-path-input"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={navigateTo}
              disabled={!creds}
              placeholder="/path/to/directory"
            />
          </div>

          {/* 브레드크럼 */}
          {creds && (
            <div className="ft-breadcrumb">
              <button
                type="button"
                className="ft-crumb"
                onClick={() => loadDir("/", creds)}
              >
                /
              </button>
              {breadcrumbs.map((b) => (
                <span key={b.path}>
                  <span className="ft-crumb-sep">/</span>
                  <button
                    type="button"
                    className="ft-crumb"
                    onClick={() => loadDir(b.path, creds)}
                  >
                    {b.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 새 폴더 입력 */}
          {showMkdir && (
            <div className="ft-mkdir-bar">
              <input
                className="ft-mkdir-input"
                placeholder="새 폴더 이름"
                value={mkdirName}
                onChange={(e) => setMkdirName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && mkdir()}
                autoFocus
              />
              <button type="button" className="btn-primary-sm" onClick={mkdir}>
                만들기
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => { setShowMkdir(false); setMkdirName(""); }}
              >
                취소
              </button>
            </div>
          )}

          {/* 파일 목록 */}
          <div className="ft-file-list-wrap">
            {!creds && (
              <div className="ft-placeholder">좌측에서 서버에 연결하세요.</div>
            )}
            {creds && isLoadingDir && (
              <div className="ft-placeholder">로딩 중...</div>
            )}
            {creds && remoteError && (
              <div className="ft-error">{remoteError}</div>
            )}
            {creds && !isLoadingDir && !remoteError && (
              <>
                <div className="ft-file-header">
                  <span>이름</span>
                  <span>크기</span>
                  <span>수정일</span>
                  <span>권한</span>
                  <span></span>
                </div>
                <div className="ft-file-list">
                  {entries.length === 0 && (
                    <div className="ft-placeholder">비어 있음</div>
                  )}
                  {entries.map((e) => (
                    <div
                      key={e.name}
                      className={`ft-file-row ${selected === e.name ? "selected" : ""} ${e.is_dir ? "is-dir" : ""}`}
                      onClick={() => setSelected(e.name)}
                      onDoubleClick={() => e.is_dir && openDir(e.name)}
                    >
                      <span className="ft-file-name">
                        <span className="ft-file-icon">
                          {e.is_dir ? "📁" : e.is_link ? "🔗" : "📄"}
                        </span>
                        {renamingEntry === e.name ? (
                          <input
                            className="ft-rename-input"
                            value={renameValue}
                            autoFocus
                            onChange={(ev) => setRenameValue(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") rename(e.name);
                              if (ev.key === "Escape") setRenamingEntry(null);
                            }}
                            onBlur={() => rename(e.name)}
                            onClick={(ev) => ev.stopPropagation()}
                          />
                        ) : (
                          e.name
                        )}
                      </span>
                      <span className="ft-file-size">
                        {e.is_dir ? "-" : formatSize(e.size)}
                      </span>
                      <span className="ft-file-date">{formatDate(e.mtime)}</span>
                      <span className="ft-file-perm">{e.permissions}</span>
                      <div
                        className="ft-file-actions"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {e.is_dir ? (
                          <button
                            type="button"
                            className="btn-xs"
                            onClick={() => openDir(e.name)}
                          >
                            열기
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-xs"
                            onClick={() => downloadFile(e.name)}
                          >
                            ↓
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-xs"
                          onClick={() => {
                            setRenamingEntry(e.name);
                            setRenameValue(e.name);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn-xs danger"
                          onClick={() => deleteEntry(e.name)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 비밀번호 모달 ── */}
      {showPasswordModal && pendingServer && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>SFTP 연결</h3>
            <p className="modal-target">
              {pendingServer.username}@{pendingServer.host}:{pendingServer.port}
            </p>
            {connectError && (
              <p className="modal-error">{connectError}</p>
            )}
            <input
              type="password"
              placeholder="SSH 비밀번호"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect(pendingServer, pwInput)}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => connect(pendingServer, pwInput)}
              >
                연결
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setShowPasswordModal(false)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
