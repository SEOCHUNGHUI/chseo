from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class ContainerSummary(BaseModel):
    id: str
    name: str
    image: str
    status: str
    state: str
    ports: str = "-"


class ContainerActionResponse(BaseModel):
    id: str
    action: str
    success: bool
    message: str
