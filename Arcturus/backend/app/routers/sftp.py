import io
import posixpath
import stat

import paramiko
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/sftp", tags=["sftp"])


class SFTPRequest(BaseModel):
    host: str
    port: int = 22
    username: str
    password: str
    path: str = "/"


class RenameRequest(BaseModel):
    host: str
    port: int = 22
    username: str
    password: str
    old_path: str
    new_path: str


def _open_sftp(host: str, port: int, username: str, password: str):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port=port, username=username, password=password, timeout=10)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SSH 연결 실패: {exc}")
    return ssh, ssh.open_sftp()


def _entry(attr) -> dict:
    is_dir = stat.S_ISDIR(attr.st_mode) if attr.st_mode else False
    is_link = stat.S_ISLNK(attr.st_mode) if attr.st_mode else False
    return {
        "name": attr.filename,
        "size": attr.st_size or 0,
        "mtime": attr.st_mtime or 0,
        "is_dir": is_dir,
        "is_link": is_link,
        "permissions": oct(attr.st_mode)[-4:] if attr.st_mode else "????",
    }


@router.post("/list")
def list_directory(data: SFTPRequest, _: User = Depends(get_current_user)):
    ssh, sftp = _open_sftp(data.host, data.port, data.username, data.password)
    try:
        attrs = sftp.listdir_attr(data.path)
        entries = sorted(
            [_entry(a) for a in attrs],
            key=lambda x: (not x["is_dir"], x["name"].lower()),
        )
        try:
            home = sftp.normalize(".")
        except Exception:
            home = "/"
        return {"path": data.path, "entries": entries, "home": home}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        sftp.close()
        ssh.close()


@router.post("/upload")
async def upload_file(
    host: str = Form(...),
    port: int = Form(22),
    username: str = Form(...),
    password: str = Form(...),
    path: str = Form(...),
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    ssh, sftp = _open_sftp(host, port, username, password)
    try:
        remote_path = posixpath.join(path.rstrip("/"), file.filename)
        content = await file.read()
        with sftp.open(remote_path, "wb") as f:
            f.write(content)
        return {"ok": True, "path": remote_path, "size": len(content)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        sftp.close()
        ssh.close()


@router.post("/download")
def download_file(data: SFTPRequest, _: User = Depends(get_current_user)):
    ssh, sftp = _open_sftp(data.host, data.port, data.username, data.password)
    try:
        buf = io.BytesIO()
        sftp.getfo(data.path, buf)
        sftp.close()
        ssh.close()
        buf.seek(0)
        filename = posixpath.basename(data.path)
        return StreamingResponse(
            buf,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        sftp.close()
        ssh.close()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/mkdir")
def make_directory(data: SFTPRequest, _: User = Depends(get_current_user)):
    ssh, sftp = _open_sftp(data.host, data.port, data.username, data.password)
    try:
        sftp.mkdir(data.path)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        sftp.close()
        ssh.close()


@router.post("/delete")
def delete_entry(data: SFTPRequest, _: User = Depends(get_current_user)):
    ssh, sftp = _open_sftp(data.host, data.port, data.username, data.password)
    try:
        attr = sftp.stat(data.path)
        if stat.S_ISDIR(attr.st_mode):
            sftp.rmdir(data.path)
        else:
            sftp.remove(data.path)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        sftp.close()
        ssh.close()


@router.post("/rename")
def rename_entry(data: RenameRequest, _: User = Depends(get_current_user)):
    ssh, sftp = _open_sftp(data.host, data.port, data.username, data.password)
    try:
        sftp.rename(data.old_path, data.new_path)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        sftp.close()
        ssh.close()
