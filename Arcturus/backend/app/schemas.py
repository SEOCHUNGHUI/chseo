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


class DBConnectionCreate(BaseModel):
    name: str
    host: str
    port: int = 5432
    username: str
    dbname: str


class DBConnectionOut(BaseModel):
    id: int
    name: str
    host: str
    port: int
    username: str
    dbname: str

    model_config = {"from_attributes": True}


class QueryRequest(BaseModel):
    connection_id: int
    password: str
    sql: str


class SchemaRequest(BaseModel):
    connection_id: int
    password: str


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list]
    rowcount: int = 0
    error: str | None = None
