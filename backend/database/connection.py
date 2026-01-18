from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional

from config import settings
from utils.logger import logger


class DatabaseManager:    
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.database: Optional[AsyncIOMotorDatabase] = None
    
    async def connect_to_mongo(self):
        try:
            self.client = AsyncIOMotorClient(settings.mongodb_url)
            self.database = self.client[settings.database_name]
            
            # Test the connection
            await self.client.admin.command('ping')
            logger.info(f"Connected to MongoDB at {settings.mongodb_url}")
            
            # Initialize indexes here when needed
            await self.create_indexes()
            
        except Exception as e:
            logger.error(f"Could not connect to MongoDB: {e}")
            raise
    
    async def close_mongo_connection(self):
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    async def create_indexes(self):
        try:
            # Canvas collection indexes
            canvas_collection = self.database.canvas
            
            # Create indexes for canvas collection
            await canvas_collection.create_index("user_id")
            await canvas_collection.create_index("created_at")
            
            logger.info("Database indexes created successfully")
            
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    def get_database(self) -> AsyncIOMotorDatabase:
        if self.database is None:
            raise RuntimeError("Database not initialized. Call connect_to_mongo() first.")
        return self.database


# Global database manager instance
db_manager = DatabaseManager()


async def get_database() -> AsyncIOMotorDatabase:
    return db_manager.get_database() 