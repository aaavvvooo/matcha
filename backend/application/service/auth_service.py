from fastapi import HTTPException, status
from datetime import timedelta, datetime, timezone
from pprint import pprint
from pydantic import EmailStr

from application.repository import UserRepository, TokenRepository
from application.schema import RegisterRequest, RegisterUserResponse, TokenInfo
from application.utils import get_password_hash, validate_password, verify_password, create_access_token, create_verification_token, decode_token, create_password_reset_token
from application.tasks.email_tasks import send_password_reset_email_task
from application.database import Database



class AuthService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)


    async def register(self, request: RegisterRequest):
        try:
            user = await self.user_repo.get_user_by_email(request.email)
            if user:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

            user = await self.user_repo.get_user_by_username(request.username)
            if user:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")   
            
            validate_password(request.password)
            hashed_password = get_password_hash(request.password) 
            token = create_verification_token()
            expiration_date = datetime.now(timezone.utc) + timedelta(days=1)

            async with self.db.pool.acquire() as connection:
                async with connection.transaction():
                    user_record = await self.user_repo.create_user(request.full_name, request.username, request.email, hashed_password, connection)
                    user = RegisterUserResponse(**user_record)
                    token_record = await self.token_repo.create_verification_token(user.id, token, "email", expiration_date, connection)
                    token = TokenInfo(**token_record)
            return user, token
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")
        
    async def verify_email(self, token: str):
        try:
            token_record = await self.token_repo.get_verification_token(token)
            token = TokenInfo(**token_record)
            if not token:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
            if token.used or token.expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired")
            
            async with self.db.pool.acquire() as connection:
                async with connection.transaction():
                    await self.token_repo.mark_token_as_used(token.id, connection)
                    user_record = await self.user_repo.update_user({"id": token.user_id,"is_validated": True}, connection)
            user = RegisterUserResponse(**user_record)
            return user
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")
        
    async def login(self, username: str, password: str):
        try:
            user = await self.user_repo.get_user_by_username(username)
            if not user:
                user = await self.user_repo.get_user_by_email(username)
            if not user:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User does not exist")
            if not verify_password(password, user["hashed_password"]):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")
            if not user["is_validated"]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email not verified")
            access_token = create_access_token(data={"sub": user["username"]})
            return access_token
        except HTTPException:
            raise

    async def logout(self, token: str):
        try:
            payload = decode_token(token)
            if not payload:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

            exp = payload.get("exp")
            if not exp:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token missing expiration")

            if isinstance(exp, (int, float)):
                exp_time = datetime.fromtimestamp(exp, tz=timezone.utc)
            elif isinstance(exp, datetime):
                exp_time = exp
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token expiration")

            if exp_time < datetime.now(timezone.utc):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired")
            return True
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")


    async def forget_password(self, username_or_email: str):
        try:
            user = await self.user_repo.get_user_by_email(username_or_email)
            if not user:
                user = await self.user_repo.get_user_by_username(username_or_email)
                if not user:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User does not exist")   
            tokens = create_password_reset_token()
            await self.token_repo.create_verification_token(user_id=user["id"], token=tokens["hashed_token"], token_type="password_reset", expires_at=tokens["expiry"])
            send_password_reset_email_task.delay(to=user["email"], username=user["username"], token=tokens["token"])
            # return {"message": "Password reset email sent"}
        except HTTPException:
            raise
            
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")
        

                
