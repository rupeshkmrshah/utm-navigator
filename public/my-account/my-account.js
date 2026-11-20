document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('profileForm');
  const submitBtn = document.getElementById('submitBtn');
  const messageDiv = document.getElementById('message');

  // Load current user data
  loadUserProfile();

  // Handle form submission
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    await updateProfile();
  })

  async function loadUserProfile() {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (data.user) {
        document.getElementById('name').value = data.user.name || '';
        document.getElementById('username').value = data.user.username || '';
        document.getElementById('email').value = data.user.email || '';

        // Show username in the greeting element
        const greetElement = document.getElementById('my-greet');
        if (greetElement) {
          const displayName = data.user.name || data.user.username || 'there';
          const logoutLink = document.createElement('a');
          logoutLink.href = '/logout';
          logoutLink.textContent = 'log out';
          greetElement.replaceChildren(
            document.createTextNode(`Hello, ${displayName}! `),
            document.createTextNode(`Not ${displayName}? `),
            logoutLink
          );
        }
      } else {
        showMessage('Failed to load user data', 'error');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      showMessage('Failed to load user data', 'error');
    }
  }

  async function updateProfile() {
    const formData = new FormData(form);
    const updateData = {
      name: formData.get('name').trim(),
      username: formData.get('username').trim(),
      email: formData.get('email').trim(),
      password: formData.get('password').trim()
    };

    // Remove password if empty
    if (!updateData.password) {
      delete updateData.password;
    }

    // Basic validation
    if (!updateData.name || !updateData.username || !updateData.email) {
      showMessage('Please fill in all required fields', 'error');
      return;
    }

    if (updateData.password && updateData.password.length < 6) {
      showMessage('Password must be at least 6 characters long', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
      const response = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      if (response.ok) {
        showMessage('Profile updated successfully!', 'success');
        // Clear password field
        document.getElementById('password').value = '';
        // Log activity if available
        if (window.frontendLogger) {
          window.frontendLogger.logActivity('PROFILE_UPDATE', { fields: Object.keys(updateData) });
        }
      } else {
        showMessage(result.error || 'Failed to update profile', 'error');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      showMessage('Failed to update profile', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update Profile';
    }
  }

  function showMessage(text, type) {
    messageDiv.innerHTML = `<div class="message ${type}">${text}</div>`;
    setTimeout(() => {
      messageDiv.innerHTML = '';
    }, 5000);
  }

  // Network status functions
  function showNetworkToast(message, type) {
    const toast = document.getElementById('network-toast');
    toast.textContent = message;
    toast.className = `network-toast ${type}`;
    toast.classList.remove('hidden');

    if (type === 'online') {
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    }
  }

  // Initial network check
  if (!navigator.onLine) {
    showNetworkToast("You're offline. Check your connection.", 'offline');
  }

  // Listen for network changes
  window.addEventListener('offline', () => {
    showNetworkToast("You're offline. Check your connection.", 'offline');
  });

  window.addEventListener('online', () => {
    showNetworkToast("You're back online 🎉", 'online');
  });
});

//tabs js
function openTabs(evt, cityName) {
  const panel = document.getElementById(cityName);
  const selectedTab = evt.currentTarget;
  if (!panel || selectedTab.hidden) return;

  document.querySelectorAll('.tabcontent').forEach(tabPanel => {
    tabPanel.hidden = tabPanel !== panel;
    tabPanel.style.display = tabPanel === panel ? 'block' : 'none';
  });
  document.querySelectorAll('.tablinks').forEach(tabButton => {
    const selected = tabButton === selectedTab;
    tabButton.classList.toggle('active', selected);
    tabButton.setAttribute('aria-selected', String(selected));
    tabButton.tabIndex = selected ? 0 : -1;
  });
}

// Conditional tab display based on user role
(async function() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    const user = data?.user;
    const role = user?.role;

    // List of admin-only tab IDs
    const adminTabs = [
      'tab-resolution-stats',
      'tab-time-stats',
      'tab-all-users',
      'tab-signup-approvals'
    ];

    adminTabs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = role !== 'Admin';
    });
    const analyticsTab = document.getElementById('tab-analytics');
    if (analyticsTab) analyticsTab.hidden = !['Admin', 'Analytics'].includes(role);
  } catch (error) {
    console.error('Error checking user role for tabs:', error);
    // Hide admin tabs on error
    const adminTabs = [
      'tab-analytics',
      'tab-resolution-stats',
      'tab-time-stats',
      'tab-all-users',
      'tab-signup-approvals'
    ];
    adminTabs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    const analyticsTab = document.getElementById('tab-analytics');
    if (analyticsTab) analyticsTab.hidden = true;
  }
})();

// Arrow-key navigation for the tab list.
document.querySelector('.tab[role="tablist"]')?.addEventListener('keydown', event => {
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('.tablinks')].filter(tab => !tab.hidden);
  if (!tabs.length) return;
  const currentIndex = tabs.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else if (['ArrowRight', 'ArrowDown'].includes(event.key)) nextIndex = (currentIndex + 1) % tabs.length;
  else nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
});

// Get the element with id="defaultOpen" and click on it
document.getElementById("defaultOpen").click();