import os
from typing import Any

import docker
from docker.errors import APIError, NotFound

_client: docker.DockerClient | None = None


def get_docker() -> docker.DockerClient:
    global _client
    if _client is not None:
        try:
            _client.ping()
            return _client
        except Exception:
            _client = None
    base_url = os.environ.get("DOCKER_HOST", "unix:///var/run/docker.sock")
    _client = docker.from_env(environment={"DOCKER_HOST": base_url})
    return _client


def list_containers(all_containers: bool = True) -> list[dict[str, Any]]:
    client = get_docker()
    containers = client.containers.list(all=all_containers)
    result = []
    for c in containers:
        names = c.attrs.get("Names") or []
        name = names[0].lstrip("/") if names else c.short_id
        ports_map = c.ports or {}
        port_parts = []
        for container_port, bindings in ports_map.items():
            if bindings:
                for b in bindings:
                    hp = b.get("HostPort", "")
                    if hp:
                        port_parts.append(f"{hp}:{container_port.split('/')[0]}")
        result.append(
            {
                "id": c.short_id,
                "full_id": c.id,
                "name": name,
                "image": (c.image.tags[0] if c.image.tags else c.image.short_id),
                "status": c.status,
                "state": c.attrs.get("State", {}).get("Status", c.status),
                "ports": ", ".join(sorted(port_parts)) if port_parts else "-",
            }
        )
    return sorted(result, key=lambda x: x["name"])


def container_action(container_id: str, action: str) -> dict[str, Any]:
    client = get_docker()
    try:
        container = client.containers.get(container_id)
    except NotFound as exc:
        raise ValueError(f"Container not found: {container_id}") from exc

    try:
        if action == "start":
            container.start()
        elif action == "stop":
            container.stop()
        elif action == "restart":
            container.restart()
        else:
            raise ValueError(f"Unknown action: {action}")
    except APIError as exc:
        raise ValueError(str(exc)) from exc

    container.reload()
    return {
        "id": container.short_id,
        "action": action,
        "success": True,
        "message": f"Container {action} completed",
        "status": container.status,
    }
