import os
import re
import pytest
import httpx

# Configuration
API_BASE_URL = "http://127.0.0.1:8000"
FRONTEND_DIR = "/root/.hermes/kanban/workspaces/t_8f3fccf8"

def test_frontend_files_exist():
    """Verify that essential frontend assets exist in the workspace."""
    assert os.path.exists(os.path.join(FRONTEND_DIR, "index.html")), "index.html is missing"
    assert os.path.exists(os.path.join(FRONTEND_DIR, "app.js")), "app.js is missing"

def test_frontend_structure_and_ids():
    """Analyze index.html to ensure all required fields and views are present with correct IDs."""
    with open(os.path.join(FRONTEND_DIR, "index.html"), "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check essential forms
    assert 'id="login-form"' in content, "Login form is missing correct ID"
    assert 'id="register-form"' in content, "Register form is missing correct ID"
    
    # Check essential input fields
    assert 'id="login-username"' in content, "Login username input is missing correct ID"
    assert 'id="login-password"' in content, "Login password input is missing correct ID"
    assert 'id="register-username"' in content, "Register username input is missing correct ID"
    assert 'id="register-password"' in content, "Register password input is missing correct ID"
    assert 'id="register-confirm-password"' in content, "Register confirm password input is missing correct ID"
    
    # Check buttons and indicators
    assert 'id="login-submit-btn"' in content, "Login button is missing correct ID"
    assert 'id="register-submit-btn"' in content, "Register button is missing correct ID"
    assert 'id="test-auth-btn"' in content, "Token test button is missing correct ID"
    assert 'id="logout-btn"' in content, "Logout button is missing correct ID"
    assert 'class="spinner' in content, "Visual loading spinners are missing"

def test_frontend_javascript_logic():
    """Analyze app.js to ensure all core auth, validation, and session logics are correctly implemented."""
    with open(os.path.join(FRONTEND_DIR, "app.js"), "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check API base URL configuration
    assert "http://127.0.0.1:8000" in content, "app.js does not specify correct backend URL"
    
    # Check localStorage token persistence
    assert "localStorage.setItem('token'" in content, "Token saving logic is missing"
    assert "localStorage.getItem('token')" in content, "Token retrieval logic is missing"
    assert "localStorage.removeItem('token')" in content, "Token removal/logout logic is missing"
    
    # Check validation functions
    assert "validateField" in content, "Validation helper function is missing"
    assert "setInputError" in content, "Input error rendering logic is missing"
    assert "clearInputError" in content, "Input error clearing logic is missing"
    assert "username" in content and "password" in content, "Required fields are missing validation hooks"

def test_backend_auth_endpoints_integration():
    """Verify backend integration directly using a synchronous HTTP client on real running server."""
    import random
    
    # Create a unique user for this test execution
    test_num = random.randint(1000, 9999)
    username = f"test_user_{test_num}"
    password = "secure_password_123"
    
    with httpx.Client() as client:
        # 1. Register user
        reg_payload = {"username": username, "password": password}
        reg_resp = client.post(f"{API_BASE_URL}/register", json=reg_payload)
        
        assert reg_resp.status_code == 201, f"Registration failed with code {reg_resp.status_code}: {reg_resp.text}"
        reg_json = reg_resp.json()
        assert reg_json["username"] == username
        
        # 2. Register duplicate (should fail)
        dup_resp = client.post(f"{API_BASE_URL}/register", json=reg_payload)
        assert dup_resp.status_code == 400, "Registration did not prevent duplicate username"
        
        # 3. Login user (correct credentials)
        login_payload = {"username": username, "password": password}
        login_resp = client.post(f"{API_BASE_URL}/login", json=login_payload)
        
        assert login_resp.status_code == 200, f"Login failed with code {login_resp.status_code}: {login_resp.text}"
        login_json = login_resp.json()
        assert "access_token" in login_json, "Access token missing from login response"
        assert login_json["token_type"] == "bearer"
        
        token = login_json["access_token"]
        
        # 4. Login user (incorrect credentials)
        bad_login_payload = {"username": username, "password": "wrong_password"}
        bad_login_resp = client.post(f"{API_BASE_URL}/login", json=bad_login_payload)
        assert bad_login_resp.status_code == 401, "Login allowed incorrect credentials"
        
        # 5. Access protected endpoint (valid token)
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = client.get(f"{API_BASE_URL}/users/me", headers=headers)
        assert me_resp.status_code == 200, f"Failed to access users/me: {me_resp.text}"
        me_json = me_resp.json()
        assert me_json["username"] == username
        assert "id" in me_json
        
        # 6. Access protected endpoint (invalid token)
        bad_headers = {"Authorization": "Bearer invalid_token_123456"}
        bad_me_resp = client.get(f"{API_BASE_URL}/users/me", headers=bad_headers)
        assert bad_me_resp.status_code == 401, "Access allowed with invalid token"
