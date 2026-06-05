import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import "./DBEditorPage.css";

interface DBConnection {
  id: number;
  name: string;
  db_type: string;
  host: string;
  port: number;
  username: string;
  dbname: string;
}

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowcount: number;
  error?: string;
}

interface TableInfo {
  schema: string;
  name: string;
  type: string;
}

const DEFAULT_PORT: Record<string, string> = { postgresql: "5432", mysql: "3306" };
const EMPTY_FORM = { name: "", db_type: "postgresql", host: "", port: "5432", username: "", dbname: "" };

export default function DBEditorPage() {
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [activeConn, setActiveConn] = useState<DBConnection | null>(null);
  const [password, setPassword] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingConn, setPendingConn] = useState<DBConnection | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [sql, setSql] = useState("SELECT 1;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runTime, setRunTime] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const loadConnections = useCallback(async () => {
    const data = await apiFetch<DBConnection[]>("/api/db/connections");
    setConnections(data);
  }, []);

  useEffect(() => {
    loadConnections().catch(console.error);
  }, [loadConnections]);

  async function connect(conn: DBConnection, pw: string) {
    setConnecting(true);
    try {
      const schema = await apiFetch<{ columns: string[]; rows: string[][] }>("/api/db/schema", {
        method: "POST",
        body: JSON.stringify({ connection_id: conn.id, password: pw }),
      });
      if ((schema as unknown as { error?: string }).error) {
        alert("연결 실패: " + (schema as unknown as { error: string }).error);
        return;
      }
      const tableList: TableInfo[] = (schema.rows ?? []).map((r) => ({
        schema: r[0],
        name: r[1],
        type: r[2],
      }));
      setTables(tableList);
      setActiveConn(conn);
      setPassword(pw);
      setIsConnected(true);
      setResult(null);
      setRunTime(null);
    } catch (err) {
      alert("연결 실패: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setConnecting(false);
    }
  }

  function openPasswordModal(conn: DBConnection) {
    setPendingConn(conn);
    setPwInput("");
    setShowPasswordModal(true);
  }

  async function handleConnect() {
    if (!pendingConn) return;
    setShowPasswordModal(false);
    await connect(pendingConn, pwInput);
  }

  function disconnect() {
    setActiveConn(null);
    setPassword("");
    setIsConnected(false);
    setTables([]);
    setResult(null);
    setRunTime(null);
  }

  async function runQuery() {
    if (!activeConn || !isConnected || !sql.trim() || isRunning) return;
    setIsRunning(true);
    const start = Date.now();
    try {
      const r = await apiFetch<QueryResult>("/api/db/query", {
        method: "POST",
        body: JSON.stringify({ connection_id: activeConn.id, password, sql }),
      });
      setResult(r);
      setRunTime(Date.now() - start);
    } catch (err) {
      setResult({ columns: [], rows: [], rowcount: 0, error: String(err) });
    } finally {
      setIsRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      const end = el.selectionEnd;
      const next = sql.substring(0, s) + "  " + sql.substring(end);
      setSql(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  }

  function insertTableQuery(schema: string, name: string) {
    const q =
      activeConn?.db_type === "mysql"
        ? `SELECT * FROM \`${name}\` LIMIT 100;`
        : `SELECT * FROM "${schema}"."${name}" LIMIT 100;`;
    setSql(q);
    editorRef.current?.focus();
  }

  async function saveConnection() {
    const { name, db_type, host, port, username, dbname } = form;
    if (!name || !host || !username || !dbname) {
      alert("필수 항목(이름, Host, 사용자명, DB명)을 입력하세요");
      return;
    }
    await apiFetch("/api/db/connections", {
      method: "POST",
      body: JSON.stringify({ name, db_type, host, port: Number(port), username, dbname }),
    });
    setForm(EMPTY_FORM);
    setShowAddForm(false);
    await loadConnections();
  }

  async function deleteConnection(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("이 연결을 삭제하시겠습니까?")) return;
    await apiFetch(`/api/db/connections/${id}`, { method: "DELETE" });
    if (activeConn?.id === id) disconnect();
    await loadConnections();
  }

  const schemas = Array.from(new Set(tables.map((t) => t.schema)));

  return (
    <div className="db-editor-page">
      {/* ── 좌측 사이드바 ── */}
      <div className="db-sidebar">
        <div className="db-sidebar-header">
          <span>DB 연결</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowAddForm((v) => !v)}
            title="새 연결 추가"
          >
            +
          </button>
        </div>

        {showAddForm && (
          <div className="db-add-form">
            <input
              placeholder="이름 *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="db-type-toggle">
              {["postgresql", "mysql"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`db-type-btn ${form.db_type === t ? "active" : ""}`}
                  onClick={() =>
                    setForm((f) => ({ ...f, db_type: t, port: DEFAULT_PORT[t] }))
                  }
                >
                  {t === "postgresql" ? "🐘 PostgreSQL" : "🐬 MySQL"}
                </button>
              ))}
            </div>
            <input
              placeholder="Host *"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            />
            <div className="form-row">
              <input
                placeholder="Port"
                value={form.port}
                style={{ width: "60px" }}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              />
              <input
                placeholder="Username *"
                style={{ flex: 1 }}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <input
              placeholder="DB Name *"
              value={form.dbname}
              onChange={(e) => setForm((f) => ({ ...f, dbname: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && saveConnection()}
            />
            <div className="form-actions">
              <button type="button" className="btn-primary-sm" onClick={saveConnection}>
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

        <div className="db-conn-list">
          {connections.length === 0 && (
            <div className="db-empty">연결이 없습니다.<br />+ 버튼으로 추가하세요.</div>
          )}
          {connections.map((c) => (
            <div
              key={c.id}
              className={`db-conn-row ${activeConn?.id === c.id && isConnected ? "connected" : ""}`}
            >
              <button
                type="button"
                className="db-conn-info"
                onClick={() => openPasswordModal(c)}
              >
                <span className="db-conn-name">
                  <span className="db-type-icon">
                    {c.db_type === "mysql" ? "🐬" : "🐘"}
                  </span>
                  {c.name}
                </span>
                <span className="db-conn-addr">
                  {c.username}@{c.host}:{c.port}/{c.dbname}
                </span>
                {activeConn?.id === c.id && isConnected && (
                  <span className="db-badge">연결됨</span>
                )}
              </button>
              <button
                type="button"
                className="btn-remove"
                onClick={(e) => deleteConnection(c.id, e)}
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {isConnected && (
          <>
            <div className="db-schema-header">
              <span>테이블</span>
              <button type="button" className="btn-danger-sm" onClick={disconnect}>
                해제
              </button>
            </div>
            <div className="db-table-list">
              {schemas.map((schema) => (
                <div key={schema} className="db-schema-group">
                  <div className="db-schema-label">{schema}</div>
                  {tables
                    .filter((t) => t.schema === schema)
                    .map((t) => (
                      <button
                        key={`${t.schema}.${t.name}`}
                        type="button"
                        className="db-table-item"
                        onClick={() => insertTableQuery(t.schema, t.name)}
                        title={`SELECT * FROM "${t.schema}"."${t.name}" LIMIT 100`}
                      >
                        <span className="db-table-icon">
                          {t.type === "VIEW" ? "◈" : "▤"}
                        </span>
                        {t.name}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 우측 에디터 + 결과 ── */}
      <div className="db-main">
        {connecting && (
          <div className="db-connecting">연결 중...</div>
        )}

        <div className="db-editor-wrap">
          <textarea
            ref={editorRef}
            className="db-sql-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isConnected
                ? "SQL 쿼리를 입력하세요 (Ctrl+Enter 실행, 테이블 클릭 시 자동 입력)"
                : "좌측에서 DB에 연결하세요"
            }
            spellCheck={false}
            disabled={!isConnected}
          />
          <div className="db-toolbar">
            <button
              type="button"
              className="btn-run"
              onClick={runQuery}
              disabled={!isConnected || isRunning}
            >
              {isRunning ? "실행 중..." : "▶ 실행"}
            </button>
            <span className="db-shortcut">Ctrl+Enter</span>
            <div className="db-toolbar-right">
              {result && !result.error && runTime !== null && (
                <span className="db-stat">
                  {result.columns.length > 0
                    ? `${result.rowcount}행 · ${runTime}ms`
                    : `${result.rowcount}행 영향 · ${runTime}ms`}
                </span>
              )}
              {isConnected && (
                <span className="db-conn-indicator">
                  ● {activeConn?.name} ({activeConn?.dbname})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="db-result-wrap">
          {!result && !isRunning && (
            <div className="db-result-empty">쿼리를 실행하면 결과가 표시됩니다.</div>
          )}
          {isRunning && (
            <div className="db-result-empty">실행 중...</div>
          )}
          {result?.error && (
            <pre className="db-result-error">{result.error}</pre>
          )}
          {result && !result.error && result.columns.length === 0 && !isRunning && (
            <div className="db-result-empty">완료: {result.rowcount}행에 영향을 주었습니다.</div>
          )}
          {result && !result.error && result.columns.length > 0 && (
            <div className="db-result-table-wrap">
              <table className="db-result-table">
                <thead>
                  <tr>
                    <th className="db-row-num">#</th>
                    {result.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      <td className="db-row-num">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j}>
                          {cell === null ? (
                            <span className="db-null">NULL</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 비밀번호 모달 ── */}
      {showPasswordModal && pendingConn && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>DB 연결</h3>
            <p className="modal-target">
              {pendingConn.username}@{pendingConn.host}:{pendingConn.port}/{pendingConn.dbname}
            </p>
            <input
              type="password"
              placeholder="비밀번호"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={handleConnect}>
                연결
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
