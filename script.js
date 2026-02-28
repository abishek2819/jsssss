// ── Login / Register Page Logic ───────────────────────────────────────────────
// Redirect if already logged in
redirectIfLoggedIn();

const form = document.getElementById('login-form');
const heading = document.getElementById('login-heading');
const nameLabel = document.querySelector('label[for="name"]');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmLabel = document.querySelector('label[for="confirm-password"]');
const confirmInput = document.getElementById('confirm-password');
const toggleBtn = document.getElementById('toggle-password');
const switchModeBtn = document.getElementById('switch-mode');
const msgBox = document.getElementById('form-msg');
const submitBtn = document.getElementById('submit-btn');
const demoCreds = document.getElementById('demo-creds');
const googleBtn = document.getElementById('google-btn');

let registerMode = false;

// Mock Google Sign-in
googleBtn.addEventListener('click', () => {
  showMsg('Google Sign-in is not configured yet, but it looks great, right? 😉', false);
});

// Toggle show/hide password
toggleBtn.addEventListener('click', () => {
  const shown = passwordInput.type === 'text';
  passwordInput.type = shown ? 'password' : 'text';
  toggleBtn.setAttribute('aria-pressed', String(!shown));
  toggleBtn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
});

// Switch between Login and Register
switchModeBtn.addEventListener('click', () => {
  registerMode = !registerMode;
  form.setAttribute('data-mode', registerMode ? 'register' : 'login');

  nameLabel.classList.toggle('hidden', !registerMode);
  nameInput.classList.toggle('hidden', !registerMode);
  confirmLabel.classList.toggle('hidden', !registerMode);
  confirmInput.classList.toggle('hidden', !registerMode);

  heading.textContent = registerMode ? 'Create your account' : 'Sign in to your account';
  submitBtn.textContent = registerMode ? 'Create account' : 'Sign in';
  switchModeBtn.textContent = registerMode ? 'Already have an account? Sign in' : 'Create an account';
  demoCreds.style.display = registerMode ? 'none' : '';

  nameInput.required = registerMode;
  confirmInput.required = registerMode;
  clearMsg();
});

function showMsg(text, isError = true) {
  msgBox.textContent = text;
  msgBox.className = isError ? 'error' : 'success';
  msgBox.classList.remove('hidden');
}
function clearMsg() {
  msgBox.classList.add('hidden');
  msgBox.textContent = '';
}

function validate() {
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const pwd = passwordInput.value;
  const confirm = confirmInput.value;

  if (registerMode && (!name || name.length < 2)) return 'Please enter your name (2+ characters).';
  if (!email) return 'Please enter your email.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Please enter a valid email address.';
  if (!pwd) return 'Please enter your password.';
  if (pwd.length < 8) return 'Password must be at least 8 characters.';
  if (registerMode && pwd !== confirm) return 'Passwords do not match.';
  return null;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  clearMsg();

  const err = validate();
  if (err) { showMsg(err); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = registerMode ? 'Creating account…' : 'Signing in…';

  try {
    const endpoint = registerMode ? '/api/register' : '/api/login';
    const payload = registerMode
      ? { username: nameInput.value.trim(), email: emailInput.value.trim(), password: passwordInput.value }
      : { email: emailInput.value.trim(), password: passwordInput.value };

    const res = await fetch('http://localhost:3000' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      showMsg(data.message || (registerMode ? 'Registration failed.' : 'Sign-in failed.'));
      return;
    }

    saveAuth(data.token, data.user);
    showMsg(registerMode ? '✓ Account created! Redirecting…' : '✓ Signed in! Redirecting…', false);
    setTimeout(() => { window.location.href = 'blog.html'; }, 900);

  } catch (fetchErr) {
    showMsg('Cannot connect to server. Make sure the server is running.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = registerMode ? 'Create account' : 'Sign in';
  }
});