import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import "./MemoPage.css";

interface MemoSummary {
  id: number;
  title: string;
  updated_at: string;
}

interface Memo {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MemoPage() {
  const [list, setList] = useState<MemoSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNew = activeId === null;

  const loadList = useCallback(async () => {
    const data = await apiFetch<MemoSummary[]>("/api/memos");
    setList(data);
  }, []);

  useEffect(() => {
    loadList().catch(console.error);
  }, [loadList]);

  async function openMemo(id: number) {
    if (!saved && !window.confirm("저장하지 않은 내용이 있습니다. 계속할까요?")) return;
    const memo = await apiFetch<Memo>(`/api/memos/${id}`);
    setActiveId(memo.id);
    setTitle(memo.title);
    setContent(memo.content);
    setSaved(true);
  }

  function newMemo() {
    if (!saved && !window.confirm("저장하지 않은 내용이 있습니다. 계속할까요?")) return;
    setActiveId(null);
    setTitle("");
    setContent("");
    setSaved(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (isNew) {
        const memo = await apiFetch<Memo>("/api/memos", {
          method: "POST",
          body: JSON.stringify({ title, content }),
        });
        setActiveId(memo.id);
      } else {
        await apiFetch(`/api/memos/${activeId}`, {
          method: "PUT",
          body: JSON.stringify({ title, content }),
        });
      }
      setSaved(true);
      await loadList();
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemo(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("이 메모를 삭제하시겠습니까?")) return;
    await apiFetch(`/api/memos/${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveId(null);
      setTitle("");
      setContent("");
      setSaved(true);
    }
    await loadList();
  }

  // 내용 변경 시 저장 상태 표시 + 3초 자동저장
  function handleChange(newTitle: string, newContent: string) {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaved(false);
    }, 100);
  }

  // Ctrl+S
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className="memo-page" onKeyDown={handleKeyDown}>
      {/* ── 좌측: 메모 목록 ── */}
      <div className="memo-sidebar">
        <div className="memo-sidebar-header">
          <span>메모</span>
          <button type="button" className="btn-icon" onClick={newMemo} title="새 메모">
            +
          </button>
        </div>
        <div className="memo-list">
          {list.length === 0 && (
            <div className="memo-empty">+ 버튼으로 메모를 작성하세요.</div>
          )}
          {list.map((m) => (
            <div
              key={m.id}
              className={`memo-item ${activeId === m.id ? "active" : ""}`}
            >
              <button
                type="button"
                className="memo-item-btn"
                onClick={() => openMemo(m.id)}
              >
                <span className="memo-item-title">
                  {m.title || "제목 없음"}
                </span>
                <span className="memo-item-date">{formatDate(m.updated_at)}</span>
              </button>
              <button
                type="button"
                className="memo-item-delete"
                onClick={(e) => deleteMemo(m.id, e)}
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── 우측: 에디터 ── */}
      <div className="memo-editor-wrap">
        <div className="memo-toolbar">
          <div className="memo-toolbar-left">
            <span className="memo-status">
              {saving ? "저장 중..." : saved ? (activeId ? "저장됨" : "") : "저장 안 됨 ●"}
            </span>
            <span className="memo-shortcut">Ctrl+S</span>
          </div>
          <button
            type="button"
            className="btn-save"
            onClick={save}
            disabled={saving || (saved && !isNew)}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>

        <input
          className="memo-title-input"
          placeholder="제목"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            handleChange(e.target.value, content);
          }}
        />

        <textarea
          className="memo-content-input"
          placeholder="내용을 입력하세요..."
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleChange(title, e.target.value);
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
