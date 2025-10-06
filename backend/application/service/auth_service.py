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
        user = await self.user_repo.get_user_by_email(request.email)
        if user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = await self.user_repo.get_user_by_username(request.username)
        if user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")   

        try:
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
            print(e)
            raise e

        
        

        
        