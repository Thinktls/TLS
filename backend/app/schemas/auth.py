from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str = ""
    full_name: str
    company_name: str | None = None
    role: str = "buyer"
    fluff_percentage: float = 3.5


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    company_name: str | None
    is_active: bool
    fluff_percentage: float
    buyer_score: float

    class Config:
        from_attributes = True
