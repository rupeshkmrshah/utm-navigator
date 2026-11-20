(async function() {
  document.body.classList.add('wp-admin-body');

  // Prepare scrolling wrappers before the navbar request to avoid a late
  // layout change when the shared navigation is injected.
  document.querySelectorAll('table').forEach(table => {
    const parent = table.parentElement;
    if (!parent || parent.classList.contains('wp-table-scroll')) return;
    const parentOverflow = getComputedStyle(parent).overflowX;
    if (['auto', 'scroll'].includes(parentOverflow)) return;
    const scroller = document.createElement('div');
    scroller.className = 'wp-table-scroll';
    parent.insertBefore(scroller, table);
    scroller.appendChild(table);
  });

  // Load shared navigation after page layout is stable.
  const resp = await fetch('/components/navbar/navbar.html');
  if (!resp.ok) return;
  const html = await resp.text();
  const root = document.getElementById('navbar-root');
  if (!root) return;
  root.innerHTML = html;

  // Step 2: Load CSS
  const cssId = 'navbar-css';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = '/components/navbar/navbar.css';
    document.head.appendChild(link);
  }

  // Account menu offers direct access to profile settings and sign out.
  const userMenuRoot = document.getElementById('wp-topbar-user');
  const userMenuButton = document.getElementById('wp-user-trigger');
  const userMenu = document.getElementById('wp-user-menu');
  const setUserMenuOpen = open => {
    userMenuRoot?.classList.toggle('is-open', open);
    userMenuButton?.setAttribute('aria-expanded', String(open));
    if (userMenu) userMenu.hidden = !open;
  };
  userMenuButton?.addEventListener('click', () => setUserMenuOpen(userMenuButton.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => {
    if (!event.target.closest('#wp-topbar-user')) setUserMenuOpen(false);
  });
  document.addEventListener('keydown', event => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && userMenuButton?.getAttribute('aria-expanded') === 'true') {
      const items = [...(userMenu?.querySelectorAll('a[href]') || [])];
      if (items.length) {
        event.preventDefault();
        const activeIndex = items.indexOf(document.activeElement);
        const nextIndex = event.key === 'ArrowDown'
          ? (activeIndex + 1) % items.length
          : (activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
        items[nextIndex].focus();
      }
    }
    if (event.key === 'Escape' && userMenuButton?.getAttribute('aria-expanded') === 'true') {
      setUserMenuOpen(false);
      userMenuButton.focus();
    }
  });

  // Role-based links and current page label
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json();
    const user = data?.user;
    const role = data?.user?.role;
    const name = user?.name || user?.username || 'Account';
    const userName = document.getElementById('wp-user-name');
    const userAvatar = document.getElementById('wp-user-avatar');
    if (userName) userName.textContent = name;
    if (userAvatar) userAvatar.textContent = name.trim().charAt(0) || 'U';

    const links = {
        'link-activity': ['Admin', 'Subscriber', 'Coordinator'],
        'link-analytics': ['Admin', 'Analytics'],
        'link-resolutions': ['Admin', 'Analytics'],
        'link-time': ['Admin', 'Analytics'],
        'admin-users-link': ['Admin'],
        'link-signup-requests': ['Admin'],
        'schedule-link': ['Admin', 'Coordinator'],
        'scheduled-results-link': ['Admin', 'Coordinator'],
        'user-account': ['Admin', 'Subscriber', 'Analytics', 'Coordinator']
    };

    for (const id in links) {
        const link = document.getElementById(id);
        if (link) {
            link.style.display = links[id].includes(role) ? 'flex' : 'none';
        }
    }

    // Keep section headings only when the current role can see a link in them.
    document.querySelectorAll('.wp-menu-label').forEach(label => {
      let sibling = label.nextElementSibling;
      let hasVisibleLink = false;
      while (sibling && !sibling.classList.contains('wp-menu-label')) {
        if (sibling.matches('a[href]') && sibling.style.display !== 'none') hasVisibleLink = true;
        sibling = sibling.nextElementSibling;
      }
      label.hidden = !hasVisibleLink;
    });

    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    const navLinks = [...document.querySelectorAll('.wp-admin-menu a')].filter(link => link.style.display !== 'none');
    let active = navLinks.find(link => link.getAttribute('href') === currentPath);
    if (!active && currentPath === '/index.html') active = document.getElementById('home-dash');
    if (!active && currentPath === '/scheduler/schedule') active = document.getElementById('schedule-link');
    if (!active && currentPath === '/scheduler/scheduled-results') active = document.getElementById('scheduled-results-link');
    if (!active && currentPath === '/resolution-stats') active = document.getElementById('link-resolutions');
    if (!active && currentPath === '/analytics') active = document.getElementById('link-analytics');
    if (!active && currentPath === '/time-stats.html') active = document.getElementById('link-time');
    if (!active && currentPath === '/my-account') active = document.getElementById('user-account');
    active?.classList.add('is-active');
    const pageLabel = active?.querySelector('span:last-child')?.textContent || 'Workspace';
    const currentPage = document.getElementById('wp-current-page');
    if (currentPage) currentPage.textContent = pageLabel;
  } catch (err) {
    console.error('Error checking user role:', err);
  }
})();