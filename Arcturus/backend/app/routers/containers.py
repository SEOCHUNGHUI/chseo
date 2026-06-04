from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.docker_client import container_action, list_containers
from app.models import User
from app.schemas import ContainerActionResponse, ContainerSummary

router = APIRouter(prefix="/api/containers", tags=["containers"])


@router.get("", response_model=list[ContainerSummary])
def get_containers(_: User = Depends(get_current_user)):
    items = list_containers(all_containers=True)
    return [
        ContainerSummary(
            id=item["id"],
            name=item["name"],
            image=item["image"],
            status=item["status"],
            state=item["state"],
        )
        for item in items
    ]


@router.post("/{container_id}/{action}", response_model=ContainerActionResponse)
def do_action(container_id: str, action: str, _: User = Depends(get_current_user)):
    if action not in ("start", "stop", "restart"):
        raise HTTPException(status_code=400, detail="Invalid action")
    try:
        result = container_action(container_id, action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ContainerActionResponse(**result)
