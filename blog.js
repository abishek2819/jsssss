// ── Blog Feed Logic ──────────────────────────────────────────────────────────
(function () {
    const feed = document.getElementById('feed');
    const emptyState = document.getElementById('empty-state');
    const tagsStrip = document.getElementById('tags-strip');
    const searchInput = document.getElementById('search-input');
    const avatarBtn = document.getElementById('avatar-btn');
    const dropdown = document.getElementById('dropdown');
    const dropUser = document.getElementById('dropdown-user');
    const logoutBtn = document.getElementById('logout-btn');
    const loginLink = document.getElementById('login-link');
    const myPostsLink = document.getElementById('my-posts-link');

    let activeTag = '';
    let searchTimer;
    let allTags = new Set();

    // ── Auth UI ────────────────────────────────────────────────────────────────
    const user = getUser();
    if (user) {
        avatarBtn.textContent = renderInitials(user.username);
        dropUser.textContent = `@${user.username}`;
        myPostsLink.href = `blog.html?author=${user.id}`;
    } else {
        document.getElementById('user-menu-wrap').style.display = 'none';
        loginLink.hidden = false;
        document.getElementById('write-btn').hidden = true;
    }

    avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
    });
    document.addEventListener('click', () => { dropdown.hidden = true; });
    logoutBtn.addEventListener('click', () => { clearAuth(); window.location.href = 'index.html'; });

    // ── Load posts ─────────────────────────────────────────────────────────────
    async function loadPosts(search = '', tag = '') {
        feed.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading posts…</p></div>';
        emptyState.classList.add('hidden');

        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (tag) params.set('tag', tag);

        try {
            const res = await apiFetch(`/api/blogs?${params}`);
            const posts = await res.json();

            feed.innerHTML = '';

            // Collect tags
            posts.forEach(p => {
                (p.tags || '').split(',').forEach(t => {
                    const clean = t.trim();
                    if (clean) allTags.add(clean);
                });
            });
            renderTagStrip();

            if (!posts.length) {
                emptyState.classList.remove('hidden');
                return;
            }

            posts.forEach((p, i) => {
                const card = buildCard(p, i);
                feed.appendChild(card);
            });
        } catch (err) {
            feed.innerHTML = `<div class="loading-state"><p style="color:#f87171">Failed to load posts. Is the server running?</p></div>`;
        }
    }

    function buildCard(p, i) {
        const a = document.createElement('a');
        a.href = `post.html?id=${p.id}`;
        a.className = 'blog-card';
        a.style.animationDelay = `${i * 50}ms`;

        const tags = (p.tags || '').split(',').filter(Boolean).slice(0, 3);
        const tagsHtml = tags.map(t =>
            `<span class="card-tag">${escapeHtml(t.trim())}</span>`
        ).join('');

        a.innerHTML = `
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
      <div class="card-title">${escapeHtml(p.title)}</div>
      <div class="card-excerpt">${escapeHtml(p.excerpt || '').slice(0, 160)}${p.excerpt && p.excerpt.length > 160 ? '…' : ''}</div>
      <div class="card-footer">
        <div class="card-author-avatar">${renderInitials(p.author_name)}</div>
        <div>
          <div class="card-author-name">${escapeHtml(p.author_name)}</div>
          <div class="card-meta">${timeAgo(p.created_at)}</div>
        </div>
        <div class="card-stats">
          <span class="card-stat">🤍 ${p.like_count}</span>
          <span class="card-stat">💬 ${p.comment_count}</span>
        </div>
      </div>
    `;
        return a;
    }

    // ── Tags strip ────────────────────────────────────────────────────────────
    function renderTagStrip() {
        // Remove old tag pills (keep "All")
        Array.from(tagsStrip.querySelectorAll('.tag-pill:not([data-tag=""])')).forEach(el => el.remove());
        allTags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = 'tag-pill' + (activeTag === tag ? ' active' : '');
            btn.dataset.tag = tag;
            btn.textContent = tag;
            tagsStrip.appendChild(btn);
        });
    }

    tagsStrip.addEventListener('click', e => {
        const pill = e.target.closest('.tag-pill');
        if (!pill) return;
        activeTag = pill.dataset.tag;
        tagsStrip.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        loadPosts(searchInput.value.trim(), activeTag);
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadPosts(searchInput.value.trim(), activeTag), 350);
    });

    // Check URL params on load
    const urlParams = new URLSearchParams(window.location.search);
    const initAuthor = urlParams.get('author');
    loadPosts('', activeTag);
})();
