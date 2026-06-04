import { apiFetch } from "../api/client";
import type { Container } from "../types";
import "./ContainerList.css";

interface Props {
  containers: Container[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

export default function ContainerList({
  containers,
  selectedId,
  onSelect,
  onRefresh,
}: Props) {
  async function action(id: string, act: "start" | "stop" | "restart") {
    try {
      await apiFetch(`/api/containers/${id}/${act}`, { method: "POST" });
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="container-list">
      <div className="list-header">
        <h2>컨테이너</h2>
        <button type="button" className="btn-secondary" onClick={onRefresh}>
          새로고침
        </button>
      </div>
      <div className="list-body">
        {containers.length === 0 && <p className="empty">컨테이너가 없습니다.</p>}
        {containers.map((c) => (
          <div
            key={c.id}
            className={`container-row ${selectedId === c.id ? "selected" : ""}`}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
            role="button"
            tabIndex={0}
          >
            <div className="row-main">
              <span className="name">{c.name}</span>
              <span className={`badge status-${c.status}`}>{c.status}</span>
            </div>
            <div className="row-meta">{c.image}</div>
            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn-sm" onClick={() => action(c.id, "start")}>
                시작
              </button>
              <button type="button" className="btn-sm" onClick={() => action(c.id, "stop")}>
                중지
              </button>
              <button type="button" className="btn-sm" onClick={() => action(c.id, "restart")}>
                재시작
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
