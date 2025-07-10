# RyteAI Backend API

A FastAPI-based backend application for canvas management with MongoDB integration.

## Features

- **FastAPI** framework with async support
- **MongoDB** integration using Motor (async driver)
- **Pydantic** models for data validation
- **CORS** middleware for cross-origin requests
- **Comprehensive Canvas CRUD operations**
- **Health check endpoint**
- **Proper error handling and logging**
- **Database indexing support**

## Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── config.py              # Configuration settings
├── requirements.txt       # Python dependencies
├── database/
│   ├── __init__.py
│   └── connection.py      # MongoDB connection management
├── schemas/
│   ├── __init__.py
│   └── canvas_schemas.py  # Pydantic models
├── routers/
│   ├── __init__.py
│   └── canvas_router.py   # Canvas API endpoints
└── utils/
    └── __init__.py
```

## Installation

1. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

2. **Set up MongoDB:**

   - Install MongoDB locally or use a cloud instance
   - Default connection: `mongodb://localhost:27017`

3. **Environment Configuration:**
   Create a `.env` file in the backend directory:
   ```env
   APP_NAME=RyteAI Backend
   DEBUG=True
   MONGODB_URL=mongodb://localhost:27017
   DATABASE_NAME=ryteai_db
   ALLOWED_ORIGINS=["http://localhost:3000"]
   SECRET_KEY=your-secret-key-here
   ```

## Running the Application

### Development Mode

```bash
python main.py
```

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### With Auto-reload

```bash
uvicorn main:app --reload
```

## API Endpoints

### Health Check

- **GET** `/healthcheck` - System health status

### Canvas Management

All canvas endpoints are prefixed with `/api/v1/canvas`

#### Core CRUD Operations

- **POST** `/api/v1/canvas/` - Create a new canvas
- **GET** `/api/v1/canvas/` - Get all canvases (with user filtering)
- **GET** `/api/v1/canvas/{canvas_id}` - Get specific canvas
- **PUT** `/api/v1/canvas/{canvas_id}` - Update canvas
- **DELETE** `/api/v1/canvas/{canvas_id}` - Delete canvas

#### Special Operations

- **PATCH** `/api/v1/canvas/{canvas_id}/favorite` - Toggle favorite status
- **PATCH** `/api/v1/canvas/{canvas_id}/rename` - Rename canvas

### Query Parameters

- `user_id` (required): Filter canvases by user
- `favorites_only` (optional): Show only favorite canvases
- `skip` (optional): Pagination offset
- `limit` (optional): Maximum results per page

## API Documentation

Once the server is running, visit:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

## Canvas Data Model

```json
{
  "id": "string",
  "name": "string",
  "description": "string (optional)",
  "content": {
    "elements": [],
    "settings": {}
  },
  "is_favorite": false,
  "tags": ["string"],
  "user_id": "string",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

## Example Usage

### Create a Canvas

```bash
curl -X POST "http://localhost:8000/api/v1/canvas/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Canvas",
    "description": "A sample canvas",
    "content": {"elements": [], "settings": {}},
    "user_id": "user123",
    "tags": ["design", "draft"]
  }'
```

### Get User Canvases

```bash
curl "http://localhost:8000/api/v1/canvas/?user_id=user123"
```

### Toggle Favorite

```bash
curl -X PATCH "http://localhost:8000/api/v1/canvas/{canvas_id}/favorite" \
  -H "Content-Type: application/json" \
  -d '{"is_favorite": true}'
```

## Database Indexes

The application automatically creates the following indexes:

- `user_id` - For efficient user-based queries
- `created_at` - For chronological sorting
- Text index on `name` and `description` - For search functionality

## Configuration Options

All configuration is handled through environment variables or the `.env` file:

- `APP_NAME`: Application name
- `DEBUG`: Enable debug mode
- `HOST`: Server host (default: 0.0.0.0)
- `PORT`: Server port (default: 8000)
- `MONGODB_URL`: MongoDB connection string
- `DATABASE_NAME`: MongoDB database name
- `ALLOWED_ORIGINS`: CORS allowed origins
- `SECRET_KEY`: Security secret key

## Error Handling

The API includes comprehensive error handling:

- **400**: Bad Request (invalid data format)
- **404**: Not Found (canvas doesn't exist)
- **500**: Internal Server Error (system issues)
- **503**: Service Unavailable (database connection issues)

## Development Notes

- All database operations are asynchronous using Motor
- Proper ObjectId validation for MongoDB operations
- Request/response logging for debugging
- Graceful startup and shutdown handling
- Ready for horizontal scaling

## Future Enhancements

- User authentication and authorization
- Canvas sharing and collaboration
- Version history and backups
- Advanced search and filtering
- Real-time updates via WebSockets
