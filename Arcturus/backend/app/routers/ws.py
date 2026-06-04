import asyncio
import json
import os
import pty
import select
import struct
import subprocess
import termios
import fcntl

import paramiko
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import decode_token
from app.docker_client import get_docker

router = APIRouter(tags=["websocket"])


async def _authenticate_ws(websocket: WebSocket) -> bool:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="Missing token")
        return False
    try:
        decode_token(token)
        return True
    except Exception:
        await websocket.close(code=4401, reason="Invalid token")
        return False


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


@router.websocket("/ws/logs/{container_id}")
async def container_logs(websocket: WebSocket, container_id: str):
    await websocket.accept()
    if not await _authenticate_ws(websocket):
        return

    client = get_docker()
    try:
        container = client.containers.get(container_id)
    except Exception:
        await websocket.send_json({"type": "error", "data": "Container not found"})
        await websocket.close()
        return

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def _stream():
        try:
            for chunk in container.logs(stream=True, follow=True, tail=200):
                text = chunk.decode("utf-8", errors="replace")
                asyncio.run_coroutine_threadsafe(queue.put(text), loop)
        except Exception as exc:
            asyncio.run_coroutine_threadsafe(queue.put(f"[error] {exc}"), loop)
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    stream_task = asyncio.create_task(asyncio.to_thread(_stream))

    try:
        while True:
            line = await queue.get()
            if line is None:
                break
            await websocket.send_json({"type": "log", "data": line})
    except WebSocketDisconnect:
        pass
    finally:
        stream_task.cancel()


@router.websocket("/ws/terminal")
async def host_terminal(websocket: WebSocket):
    await websocket.accept()
    if not await _authenticate_ws(websocket):
        return
    await _run_pty_shell(websocket, shell_cmd=["/bin/bash"])


@router.websocket("/ws/terminal/{container_id}")
async def container_terminal(websocket: WebSocket, container_id: str):
    await websocket.accept()
    if not await _authenticate_ws(websocket):
        return

    client = get_docker()
    try:
        container = client.containers.get(container_id)
    except Exception:
        await websocket.send_json({"type": "error", "data": "Container not found"})
        await websocket.close()
        return

    if container.status != "running":
        await websocket.send_json({"type": "error", "data": "Container is not running"})
        await websocket.close()
        return

    exec_id = client.api.exec_create(
        container.id,
        ["/bin/sh", "-c", "[ -x /bin/bash ] && exec /bin/bash; [ -x /bin/ash ] && exec /bin/ash; exec /bin/sh"],
        stdin=True,
        tty=True,
        environment={"TERM": "xterm-256color"},
    )["Id"]
    sock = client.api.exec_start(exec_id, detach=False, tty=True, stream=True, socket=True)
    sock.setblocking(False)

    loop = asyncio.get_event_loop()
    stop = asyncio.Event()

    def read_socket():
        while not stop.is_set():
            try:
                r, _, _ = select.select([sock], [], [], 0.2)
                if r:
                    data = sock.recv(4096)
                    if not data:
                        break
                    asyncio.run_coroutine_threadsafe(websocket.send_bytes(data), loop)
            except Exception:
                break

    reader = asyncio.create_task(asyncio.to_thread(read_socket))

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if "bytes" in message and message["bytes"]:
                sock.send(message["bytes"])
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    sock.send(message["text"].encode())
                    continue
                if payload.get("type") == "resize":
                    rows = int(payload.get("rows", 24))
                    cols = int(payload.get("cols", 80))
                    client.api.exec_resize(exec_id, height=rows, width=cols)
    except WebSocketDisconnect:
        pass
    finally:
        stop.set()
        reader.cancel()
        try:
            sock.close()
        except Exception:
            pass


@router.websocket("/ws/ssh")
async def ssh_terminal(websocket: WebSocket):
    await websocket.accept()
    if not await _authenticate_ws(websocket):
        return

    try:
        creds = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except (asyncio.TimeoutError, Exception):
        await websocket.close(code=4400, reason="Credential timeout")
        return

    host = creds.get("host", "")
    port = int(creds.get("port", 22))
    username = creds.get("username", "")
    password = creds.get("password", "")

    if not host or not username:
        await websocket.send_bytes(b"\r\n\x1b[31mhost / username 이 없습니다.\x1b[0m\r\n")
        await websocket.close()
        return

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port=port, username=username, password=password, timeout=10)
    except Exception as exc:
        msg = f"\r\n\x1b[31m연결 실패: {exc}\x1b[0m\r\n".encode()
        await websocket.send_bytes(msg)
        await websocket.close()
        return

    channel = ssh.invoke_shell(term="xterm-256color", width=80, height=24)
    channel.setblocking(False)

    loop = asyncio.get_event_loop()
    stop = asyncio.Event()

    def read_channel():
        while not stop.is_set():
            try:
                r, _, _ = select.select([channel], [], [], 0.2)
                if r:
                    data = channel.recv(4096)
                    if not data:
                        break
                    asyncio.run_coroutine_threadsafe(websocket.send_bytes(data), loop)
            except Exception:
                break

    reader = asyncio.create_task(asyncio.to_thread(read_channel))

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if "bytes" in message and message["bytes"]:
                channel.send(message["bytes"])
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    channel.send(message["text"].encode())
                    continue
                if payload.get("type") == "resize":
                    rows = int(payload.get("rows", 24))
                    cols = int(payload.get("cols", 80))
                    channel.resize_pty(width=cols, height=rows)
    except WebSocketDisconnect:
        pass
    finally:
        stop.set()
        reader.cancel()
        try:
            channel.close()
        except Exception:
            pass
        try:
            ssh.close()
        except Exception:
            pass


async def _run_pty_shell(websocket: WebSocket, shell_cmd: list[str]) -> None:
    master_fd, slave_fd = pty.openpty()
    proc = subprocess.Popen(
        shell_cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        preexec_fn=os.setsid,
        env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave_fd)

    loop = asyncio.get_event_loop()
    stop = asyncio.Event()

    def read_master():
        while not stop.is_set():
            try:
                r, _, _ = select.select([master_fd], [], [], 0.2)
                if r:
                    data = os.read(master_fd, 4096)
                    if not data:
                        break
                    asyncio.run_coroutine_threadsafe(websocket.send_bytes(data), loop)
            except OSError:
                break

    reader = asyncio.create_task(asyncio.to_thread(read_master))

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if "bytes" in message and message["bytes"]:
                os.write(master_fd, message["bytes"])
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    os.write(master_fd, message["text"].encode())
                    continue
                if payload.get("type") == "resize":
                    _set_winsize(
                        master_fd,
                        int(payload.get("rows", 24)),
                        int(payload.get("cols", 80)),
                    )
    except WebSocketDisconnect:
        pass
    finally:
        stop.set()
        reader.cancel()
        try:
            proc.terminate()
        except Exception:
            pass
        try:
            os.close(master_fd)
        except Exception:
            pass
