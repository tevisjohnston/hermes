import os
import pytest

# Set DATABASE_URL to a test database BEFORE importing modules
os.environ["DATABASE_URL"] = "test_auth.db"

import database
import auth
from fastapi.testclient import TestClient
from main import app

@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Remove test DB if it exists from a prior run
    if os.path.exists("test_auth.db"):
        os.remove("test_auth.db")
    
    # Initialize the test database
    database.init_db()
    
    yield
    
    # Clean up test DB after each test
    if os.path.exists("test_auth.db"):
        os.remove("test_auth.db")

client = TestClient(app)

def test_register_user_success():
    response = client.post(
        "/register",
        json={"username": "testuser", "password": "password123"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["message"] == "User registered successfully"
    assert data["username"] == "testuser"

def test_register_user_duplicate():
    # Register first user
    response = client.post(
        "/register",
        json={"username": "testuser", "password": "password123"}
    )
    assert response.status_code == 201
    
    # Register second time with same username
    response2 = client.post(
        "/register",
        json={"username": "testuser", "password": "password456"}
    )
    assert response2.status_code == 400
    assert response2.json()["detail"] == "Username already registered"

def test_register_validation_errors():
    # Username too short
    response = client.post(
        "/register",
        json={"username": "us", "password": "password123"}
    )
    assert response.status_code == 422
    
    # Password too short
    response = client.post(
        "/register",
        json={"username": "user", "password": "abc"}
    )
    assert response.status_code == 422

def test_login_success():
    # Register user first
    client.post(
        "/register",
        json={"username": "testuser", "password": "password123"}
    )
    
    # Log in
    response = client.post(
        "/login",
        json={"username": "testuser", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_invalid_credentials():
    # Try to log in with unregistered user
    response = client.post(
        "/login",
        json={"username": "nonexistent", "password": "password123"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password"
    
    # Register user
    client.post(
        "/register",
        json={"username": "testuser", "password": "password123"}
    )
    
    # Log in with wrong password
    response2 = client.post(
        "/login",
        json={"username": "testuser", "password": "wrongpassword"}
    )
    assert response2.status_code == 401
    assert response2.json()["detail"] == "Incorrect username or password"

def test_protected_route_success():
    # Register and login to get token
    client.post(
        "/register",
        json={"username": "testuser", "password": "password123"}
    )
    login_response = client.post(
        "/login",
        json={"username": "testuser", "password": "password123"}
    )
    token = login_response.json()["access_token"]
    
    # Access protected route
    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert "id" in data

def test_protected_route_unauthorized():
    # Access without token
    response = client.get("/users/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"
    
    # Access with invalid token
    response2 = client.get(
        "/users/me",
        headers={"Authorization": "Bearer invalidtoken123"}
    )
    assert response2.status_code == 401
    assert response2.json()["detail"] == "Invalid or expired token"
