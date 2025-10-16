from fastapi import HTTPException, status
from application.repository.user_repo import UserRepository
from application.repository.token_repo import TokenRepository
from application.schema import RegisterRequest, RegisterUserResponse, TokenInfo
from application.utils.password import get_password_hash, validate_password
from application.utils.tokens import create_access_token, create_verification_token
from application.database import Database
from datetime import timedelta, datetime, timezone


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

        



        
        

        
        