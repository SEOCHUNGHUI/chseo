import { useEffect, useRef, useState } from "react";
import { wsUrl } from "../api/client";
import "./LogViewer.css";

interface Props {
  containerId: string | null;
}

export default function LogViewer({ containerId }: Props) {
  const [logs, setLogs] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    atBottomRef.current = true;
    setLogs("");
    setConnected(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!containerId) return;

    const ws = new WebSocket(wsUrl(`/ws/logs/${containerId}`));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; data: string };
        if (msg.type === "log") {
          setLogs((prev) => prev + msg.data);
        } else if (msg.type === "error") {
          setLogs((prev) => prev + `\n[error] ${msg.data}\n`);
        }
      } catch {
        setLogs((prev) => prev + ev.data);
      }
    };

    return () => ws.close();
  }, [containerId]);

  // 맨 아래에 있을 때만 새 로그 따라가기 (tail -f 방식)
  useEffect(() => {
    const el = preRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  function handleScroll(e: React.UIEvent<HTMLPreElement>) {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  return (
    <div className="log-viewer">
      <div className="panel-header">
        <h3>로그</h3>
        <span className={`conn ${connected ? "on" : "off"}`}>
          {connected ? "실시간" : "연결 끊김"}
        </span>
      </div>
      <pre className="log-content" ref={preRef} onScroll={handleScroll}>
        {containerId ? logs || "로그 대기 중…" : "컨테이너를 선택하세요."}
      </pre>
    </div>
  );
}
