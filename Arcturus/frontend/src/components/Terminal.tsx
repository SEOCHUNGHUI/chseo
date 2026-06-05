import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { wsUrl } from "../api/client";
import "./Terminal.css";

interface Props {
  containerId: string | null;
  mode: "container" | "host";
}

export default function Terminal({ containerId, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      theme: {
        background: "#0a0e14",
        foreground: "#e7ecf3",
        cursor: "#3b82f6",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    function sendResize() {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }));
    }

    // ResizeObserver로 컨테이너 크기 변화 감지 (window resize보다 정확)
    const observer = new ResizeObserver(() => {
      fit.fit();
      sendResize();
    });
    observer.observe(containerRef.current);

    function connect() {
      wsRef.current?.close();

      const path =
        mode === "host" || !containerId
          ? "/ws/terminal"
          : `/ws/terminal/${containerId}`;

      const ws = new WebSocket(wsUrl(path));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        term.clear();
        term.writeln("\x1b[32m연결됨\x1b[0m");
        fit.fit();
        sendResize();
      };

      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(ev.data));
        } else {
          term.write(ev.data as string);
        }
      };

      ws.onclose = () => term.writeln("\r\n\x1b[31m연결 종료\x1b[0m");
      ws.onerror = () => term.writeln("\r\n\x1b[31m연결 오류\x1b[0m");

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data));
        }
      });
    }

    if (mode === "host" || containerId) {
      connect();
    } else {
      term.writeln("컨테이너를 선택하거나 호스트 셸 모드를 사용하세요.");
    }

    return () => {
      observer.disconnect();
      wsRef.current?.close();
      term.dispose();
    };
  }, [containerId, mode]);

  return (
    <div className="terminal-panel">
      <div className="panel-header">
        <h3>
          터미널 — {mode === "host" ? "호스트(패널)" : containerId ?? "—"}
        </h3>
      </div>
      <div className="terminal-wrap" ref={containerRef} />
    </div>
  );
}
