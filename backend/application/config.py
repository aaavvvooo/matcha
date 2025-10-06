import dotenv
import os

dotenv.load_dotenv("../.env")

POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_PORT = os.getenv("POSTGRES_PORT")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")

RESEND_API_KEY = os.getenv("RESEND_API_KEY")

REACT_APP_API_URL = os.getenv("REACT_APP_API_URL")
FROM_EMAIL = os.getenv("FROM_EMAIL")

REDIS_URL = os.getenv("REDIS_URL")



