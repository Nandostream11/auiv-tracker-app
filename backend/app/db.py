import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME", "auiv_tracker")

client: AsyncIOMotorClient = None

async def connect_db():
    global client
    client = AsyncIOMotorClient(MONGO_URL)
    # Indexes for ai_jobs
    await get_db()["ai_jobs"].create_index("device_id")
    await get_db()["ai_jobs"].create_index("status")
    await get_db()["ai_jobs"].create_index("next_retry_at")
    await get_db()["ai_jobs"].create_index([("device_id", 1), ("log_id", 1)])

async def close_db():
    global client
    if client:
        client.close()

def get_db():
    return client[DB_NAME]

def projects_col():  return get_db()["projects"]
def tasks_col():     return get_db()["tasks"]
def logs_col():      return get_db()["daily_logs"]
def jobs_col():      return get_db()["ai_jobs"]        # NEW
def weeks_col():     return get_db()["weeks"]           # NEW — user-extensible sprint weeks
