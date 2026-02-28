// ── Single Post View Logic ────────────────────────────────────────────────────
(function () {
    const loading = document.getElementById('loading');
    const article = document.getElementById('article');
    const commentsSection = document.getElementById('comments-section');
    const articleTags = document.getElementById('article-tags');
    const articleTitle = document.getElementById('article-title');
    const authorAvatar = document.getElementById('author-avatar');
    const authorName = document.getElementById('author-name');
    const authorMeta = document.getElementById('author-meta');
    const articleContent = document.getElementById('article-content');
    const tagsFooter = document.getElementById('tags-footer');
    const likeBtn = document.getElementById('like-btn');
    const likeCount = document.getElementById('like-count');
    const commentsList = document.getElementById('comments-list');
    const noComments = document.getElementById('no-comments');
    const commentCountLbl = document.getElementById('comment-count-label');
    const commentForm = document.getElementById('comment-form');
    const signInPrompt = document.getElementById('sign-in-prompt');
    const commentInput = document.getElementById('comment-input');
    const commentSubmit = document.getElementById('comment-submit');
    const commentAvatar = document.getElementById('comment-me-avatar');
    const editBtn = document.getElementById('edit-btn');
    const loginLink = document.getElementById('login-link');
    const writeLink = document.getElementById('write-link');
    const avatarBtn = document.getElementById('avatar-btn');
    const toast = document.getElementById('toast');
    const postDeleteBtn = document.getElementById('post-delete-btn');

    const params = new URLSearchParams(window.location.search);
    const postId = params.get('id');
    if (!postId) { window.location.href = 'blog.html'; return; }

    const user = getUser();

    // Auth UI
    if (user) {
        avatarBtn.textContent = renderInitials(user.username);
        avatarBtn.addEventListener('click', () => window.location.href = 'blog.html');
        commentForm.classList.remove('hidden');
        commentAvatar.textContent = renderInitials(user.username);
    } else {
        avatarBtn.style.display = 'none';
        loginLink.hidden = false;
        writeLink.hidden = true;
        signInPrompt.classList.remove('hidden');
    }

    // ── Load Post ─────────────────────────────────────────────────────────────
    async function loadPost() {
        try {
            const res = await apiFetch(`/api/blogs/${postId}`);
            if (!res || !res.ok) { window.location.href = 'blog.html'; return; }
            const post = await res.json();

            document.title = `${post.title} — StudentBlog`;

            // Tags
            const tags = (post.tags || '').split(',').filter(Boolean);
            articleTags.innerHTML = tags.map(t =>
                `<span class="article-tag">${escapeHtml(t.trim())}</span>`
            ).join('');
            tagsFooter.innerHTML = tags.map(t =>
                `<span class="article-tag">${escapeHtml(t.trim())}</span>`
            ).join('');

            // Title & content
            articleTitle.textContent = post.title;
            articleContent.innerHTML = post.content;

            // Author
            authorAvatar.textContent = renderInitials(post.author_name);
            authorName.textContent = post.author_name;
            authorMeta.textContent = `${timeAgo(post.created_at)} · ${post.author_bio || 'Student blogger'}`;

            // Like
            likeCount.textContent = post.like_count;
            if (post.liked) likeBtn.classList.add('liked');
            likeBtn.querySelector('.like-icon').textContent = post.liked ? '❤️' : '🤍';

            // Edit & Delete buttons (own posts)
            if (user && user.id === post.author_id) {
                editBtn.hidden = false;
                editBtn.addEventListener('click', () => {
                    window.location.href = `write.html?id=${postId}`;
                });

                postDeleteBtn.classList.remove('hidden');
                postDeleteBtn.addEventListener('click', async () => {
                    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;
                    try {
                        const res = await apiFetch(`/api/blogs/${postId}`, { method: 'DELETE' });
                        if (res.ok) {
                            showToast('Post deleted successfully.');
                            setTimeout(() => { window.location.href = 'blog.html'; }, 1000);
                        } else {
                            showToast('Failed to delete post.', true);
                        }
                    } catch (err) {
                        showToast('Error deleting post.', true);
                    }
                });
            }

            loading.classList.add('hidden');
            article.classList.remove('hidden');
            commentsSection.classList.remove('hidden');

            await loadComments();
        } catch (err) {
            loading.innerHTML = `<p style="color:#f87171">Failed to load post.</p>`;
        }
    }

    // ── Likes ─────────────────────────────────────────────────────────────────
    likeBtn.addEventListener('click', async () => {
        if (!user) { window.location.href = 'index.html'; return; }
        try {
            const res = await apiFetch(`/api/blogs/${postId}/like`, { method: 'POST' });
            const data = await res.json();
            likeCount.textContent = data.count;
            likeBtn.classList.toggle('liked', data.liked);
            likeBtn.querySelector('.like-icon').textContent = data.liked ? '❤️' : '🤍';
            // Bounce animation
            likeBtn.querySelector('.like-icon').style.transform = 'scale(1.4)';
            setTimeout(() => { likeBtn.querySelector('.like-icon').style.transform = ''; }, 200);
        } catch { showToast('Could not update like.', true); }
    });

    // ── Comments ──────────────────────────────────────────────────────────────
    async function loadComments() {
        const res = await apiFetch(`/api/blogs/${postId}/comments`);
        const comments = await res.json();

        commentsList.innerHTML = '';
        commentCountLbl.textContent = comments.length ? `(${comments.length})` : '';

        if (!comments.length) {
            noComments.classList.remove('hidden');
            return;
        }
        noComments.classList.add('hidden');
        comments.forEach(c => commentsList.appendChild(buildComment(c)));
    }

    function buildComment(c) {
        const div = document.createElement('div');
        div.className = 'comment-item';

        const isOwner = user && user.id === c.user_id;
        const deleteBtn = isOwner
            ? `<button class="comment-delete-btn" title="Delete comment" aria-label="Delete comment">🗑</button>`
            : '';

        div.innerHTML = `
      <div class="comment-avatar">${renderInitials(c.username)}</div>
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-username">${escapeHtml(c.username)}</span>
          <span class="comment-time">${timeAgo(c.created_at)}</span>
          ${deleteBtn}
        </div>
        <div class="comment-text">${escapeHtml(c.content)}</div>
      </div>
    `;

        if (isOwner) {
            div.querySelector('.comment-delete-btn').addEventListener('click', async () => {
                if (!confirm('Delete this comment?')) return;
                try {
                    const res = await apiFetch(`/api/blogs/${postId}/comments/${c.id}`, { method: 'DELETE' });
                    if (res && res.ok) {
                        div.remove();
                        const current = parseInt(commentCountLbl.textContent.replace(/\D/g, '')) || 0;
                        const newCount = current - 1;
                        commentCountLbl.textContent = newCount > 0 ? `(${newCount})` : '';
                        if (newCount === 0) noComments.classList.remove('hidden');
                    } else {
                        showToast('Failed to delete comment.', true);
                    }
                } catch {
                    showToast('Error deleting comment.', true);
                }
            });
        }

        return div;
    }

    commentForm.addEventListener('submit', async e => {
        e.preventDefault();
        const content = commentInput.value.trim();
        if (!content) return;

        commentSubmit.disabled = true;
        commentSubmit.textContent = 'Posting…';

        try {
            const res = await apiFetch(`/api/blogs/${postId}/comments`, {
                method: 'POST',
                body: JSON.stringify({ content }),
            });
            const comment = await res.json();
            noComments.classList.add('hidden');
            commentsList.appendChild(buildComment(comment));
            commentInput.value = '';

            // Update count label
            const current = parseInt(commentCountLbl.textContent.replace(/\D/g, '')) || 0;
            commentCountLbl.textContent = `(${current + 1})`;
        } catch {
            showToast('Failed to post comment.', true);
        } finally {
            commentSubmit.disabled = false;
            commentSubmit.textContent = 'Post comment';
        }
    });

    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.style.borderColor = isError ? 'rgba(248,113,113,0.4)' : 'rgba(99,102,241,0.4)';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    loadPost();
})();
