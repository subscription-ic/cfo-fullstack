from fastapi import APIRouter, HTTPException, status

from app.modules.auth.schemas import LoginRequest, TokenResponse
from app.modules.auth.service import create_access_token, verify_dev_credentials

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest) -> TokenResponse:
    if not verify_dev_credentials(body.username, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_access_token(subject=body.username)
    return TokenResponse(access_token=token)
