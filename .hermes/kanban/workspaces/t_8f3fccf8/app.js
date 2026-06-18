/**
 * Secure Portal Frontend Application - app.js
 * Implements JWT authentication, validation, state management, and visual loaders.
 */

// Configuration
const API_BASE_URL = 'http://127.0.0.1:8000';

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    register: document.getElementById('register-view'),
    dashboard: document.getElementById('dashboard-view'),
};

const forms = {
    login: document.getElementById('login-form'),
    register: document.getElementById('register-form'),
};

const buttons = {
    goToRegister: document.getElementById('go-to-register'),
    goToLogin: document.getElementById('go-to-login'),
    loginSubmit: document.getElementById('login-submit-btn'),
    registerSubmit: document.getElementById('register-submit-btn'),
    testAuth: document.getElementById('test-auth-btn'),
    logout: document.getElementById('logout-btn'),
};

const texts = {
    pageTitle: document.getElementById('page-title'),
    pageSubtitle: document.getElementById('page-subtitle'),
    dashboardUsername: document.getElementById('dashboard-username'),
    avatarChar: document.getElementById('user-avatar-char'),
};

const output = {
    box: document.getElementById('test-output-box'),
    json: document.getElementById('test-output-json'),
};

const toastContainer = document.getElementById('toast-container');

// Session State Management
const state = {
    token: localStorage.getItem('token') || null,
    user: null,
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    
    // Check if user has an active session
    if (state.token) {
        showLoadingSpinner(buttons.loginSubmit, true);
        const valid = await verifyTokenAndLoadUser();
        showLoadingSpinner(buttons.loginSubmit, false);
        
        if (valid) {
            switchView('dashboard');
        } else {
            // Invalid session
            logout();
        }
    } else {
        switchView('login');
    }
});

// --- Event Listeners ---
function setupEventListeners() {
    // Navigation Toggles
    buttons.goToRegister.addEventListener('click', () => switchView('register'));
    buttons.goToLogin.addEventListener('click', () => switchView('login'));

    // Form Submissions
    forms.login.addEventListener('submit', handleLogin);
    forms.register.addEventListener('submit', handleRegister);

    // Dashboard Actions
    buttons.testAuth.addEventListener('click', verifyTokenManual);
    buttons.logout.addEventListener('click', logout);

    // Real-time input validation clear
    const allInputs = document.querySelectorAll('input');
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            clearInputError(input);
        });
    });
}

// --- View Router ---
function switchView(viewName) {
    // Hide all views
    Object.values(views).forEach(view => view.classList.add('hidden'));
    
    // Show selected view
    views[viewName].classList.remove('hidden');

    // Update global layouts/headers based on state
    if (viewName === 'login') {
        texts.pageTitle.textContent = 'Access Your Portal';
        texts.pageSubtitle.textContent = 'Please sign in to continue';
    } else if (viewName === 'register') {
        texts.pageTitle.textContent = 'Join the Portal';
        texts.pageSubtitle.textContent = 'Create an account to get started';
    } else if (viewName === 'dashboard') {
        texts.pageTitle.textContent = 'Secure Dashboard';
        texts.pageSubtitle.textContent = 'Authenticated environment';
        
        if (state.user) {
            texts.dashboardUsername.textContent = `@${state.user.username}`;
            texts.avatarChar.textContent = state.user.username.charAt(0).toUpperCase();
        }
    }
}

// --- Client-side Form Validation ---
function validateField(input, validationFn, errorMessage) {
    const value = input.value.trim();
    const isValid = validationFn(value);
    
    if (!isValid) {
        setInputError(input, errorMessage);
        return false;
    }
    clearInputError(input);
    return true;
}

function setInputError(input, message) {
    input.classList.remove('border-slate-700', 'focus:border-primary-500');
    input.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500/20');
    const errorEl = input.parentElement.parentElement.querySelector('.error-msg');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

function clearInputError(input) {
    input.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500/20');
    input.classList.add('border-slate-700', 'focus:border-primary-500');
    const errorEl = input.parentElement.parentElement.querySelector('.error-msg');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
}

// Validation predicates
const valRules = {
    username: val => val.length >= 3 && val.length <= 50,
    password: val => val.length >= 6,
};

// --- Form Handlers ---
async function handleLogin(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');

    // Run client validations
    const isUserValid = validateField(usernameInput, valRules.username, 'Username must be between 3 and 50 characters.');
    const isPassValid = validateField(passwordInput, valRules.password, 'Password must be at least 6 characters.');

    if (!isUserValid || !isPassValid) {
        showToast('Please correct validation errors', 'error');
        return;
    }

    setFormLoading('login', true);

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (response.ok) {
            state.token = data.access_token;
            localStorage.setItem('token', data.access_token);
            
            showToast('Welcome back! Login successful.', 'success');
            
            // Verify and retrieve user details
            const valid = await verifyTokenAndLoadUser();
            if (valid) {
                switchView('dashboard');
                forms.login.reset();
            } else {
                showToast('Authentication failed during verification', 'error');
                logout();
            }
        } else {
            // Server error response (e.g. invalid credentials)
            const errorMsg = data.detail || 'Incorrect username or password';
            showToast(errorMsg, 'error');
            
            if (response.status === 401) {
                setInputError(passwordInput, 'Incorrect username or password');
            }
        }
    } catch (error) {
        console.error('Login Error:', error);
        showToast('Network error: Could not reach the backend server', 'error');
    } finally {
        setFormLoading('login', false);
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const usernameInput = document.getElementById('register-username');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm-password');

    // Client-side validation checks
    const isUserValid = validateField(usernameInput, valRules.username, 'Username must be between 3 and 50 characters.');
    const isPassValid = validateField(passwordInput, valRules.password, 'Password must be at least 6 characters.');
    
    let isConfirmValid = true;
    if (passwordInput.value !== confirmInput.value) {
        setInputError(confirmInput, 'Passwords do not match.');
        isConfirmValid = false;
    } else {
        clearInputError(confirmInput);
    }

    if (!isUserValid || !isPassValid || !isConfirmValid) {
        showToast('Please correct form validation errors', 'error');
        return;
    }

    setFormLoading('register', true);

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Registration successful! Please login.', 'success');
            switchView('login');
            
            // Pre-fill the username on login screen
            document.getElementById('login-username').value = usernameInput.value.trim();
            forms.register.reset();
        } else {
            const errorMsg = data.detail || 'Registration failed';
            showToast(errorMsg, 'error');
            
            if (errorMsg.toLowerCase().includes('username')) {
                setInputError(usernameInput, errorMsg);
            }
        }
    } catch (error) {
        console.error('Registration Error:', error);
        showToast('Network error: Could not connect to the database or backend', 'error');
    } finally {
        setFormLoading('register', false);
    }
}

// --- Session Verification ---
async function verifyTokenAndLoadUser() {
    if (!state.token) return false;

    try {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            state.user = userData;
            return true;
        }
    } catch (error) {
        console.error('Verify token failed:', error);
    }
    return false;
}

async function verifyTokenManual() {
    showLoadingSpinner(buttons.testAuth, true);
    output.box.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        const data = await response.json();
        output.json.textContent = JSON.stringify(data, null, 2);
        output.box.classList.remove('hidden');

        if (response.ok) {
            showToast('Token verified! Authentication active.', 'success');
        } else {
            showToast('Token validation failed: ' + (data.detail || 'Unauthorized'), 'error');
        }
    } catch (error) {
        showToast('Network error during manual authentication verify', 'error');
    } finally {
        showLoadingSpinner(buttons.testAuth, false);
    }
}

function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    output.box.classList.add('hidden');
    switchView('login');
    showToast('Logged out successfully', 'success');
}

// --- Loading Indicators & UI Locking ---
function setFormLoading(formKey, isLoading) {
    const form = forms[formKey];
    const button = buttons[`${formKey}Submit`];
    
    // Toggle spinner
    showLoadingSpinner(button, isLoading);

    // Disable all inputs in this form
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
        input.disabled = isLoading;
        if (isLoading) {
            input.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            input.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    });

    // Disable switches
    buttons.goToRegister.disabled = isLoading;
    buttons.goToLogin.disabled = isLoading;
}

function showLoadingSpinner(button, show) {
    if (!button) return;
    const textEl = button.querySelector('.btn-text');
    const spinnerEl = button.querySelector('.spinner');

    if (show) {
        button.disabled = true;
        button.classList.add('opacity-75', 'cursor-not-allowed');
        if (spinnerEl) spinnerEl.classList.remove('hidden');
    } else {
        button.disabled = false;
        button.classList.remove('opacity-75', 'cursor-not-allowed');
        if (spinnerEl) spinnerEl.classList.add('hidden');
    }
}

// --- Custom Toast Notifications ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    
    // Classes for styling
    const baseClasses = 'p-4 rounded-xl border flex items-center gap-3 shadow-xl transform transition-all duration-300 translate-x-10 opacity-0';
    const typeClasses = type === 'success' 
        ? 'bg-slate-800 border-emerald-500/30 text-emerald-400' 
        : 'bg-slate-800 border-red-500/30 text-red-400';

    toast.className = `${baseClasses} ${typeClasses}`;
    
    // Inside layout
    const icon = type === 'success'
        ? `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        : `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    toast.innerHTML = `
        ${icon}
        <div class="text-xs font-medium">${message}</div>
    `;

    toastContainer.appendChild(toast);

    // Trigger transition
    setTimeout(() => {
        toast.classList.remove('translate-x-10', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    }, 10);

    // Remove toast after delay
    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-10', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
