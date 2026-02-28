// ── Write / Edit Blog Logic ───────────────────────────────────────────────────
(function () {
    if (!requireLogin()) return;

    const titleInput = document.getElementById('title-input');
    const editor = document.getElementById('editor');
    const tagsInput = document.getElementById('tags-input');
    const publishBtn = document.getElementById('publish-btn');
    const previewBtn = document.getElementById('preview-btn');
    const previewPanel = document.getElementById('preview-panel');
    const previewTitle = document.getElementById('preview-title');
    const previewCnt = document.getElementById('preview-content');
    const saveStatus = document.getElementById('save-status');
    const deleteBar = document.getElementById('delete-bar');
    const deleteBtn = document.getElementById('delete-btn');
    const toast = document.getElementById('toast');
    const avatarBtn = document.getElementById('avatar-btn');

    const user = getUser();
    avatarBtn.textContent = renderInitials(user.username);
    avatarBtn.addEventListener('click', () => { window.location.href = 'blog.html'; });

    // Check if editing existing post
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('id');
    let isPreviewing = false;

    if (editId) {
        loadForEdit(editId);
        deleteBar.classList.remove('hidden');
        publishBtn.textContent = '💾 Save changes';
        document.title = 'StudentBlog — Edit Post';
    }

    // ── Formatting toolbar ────────────────────────────────────────────────────
    document.querySelectorAll('.tool-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault();
            document.execCommand(btn.dataset.cmd, false, null);
            editor.focus();
        });
    });

    document.getElementById('format-select').addEventListener('change', function () {
        document.execCommand('formatBlock', false, this.value);
        editor.focus();
        this.value = 'div';
    });

    // ── Preview toggle ────────────────────────────────────────────────────────
    previewBtn.addEventListener('click', () => {
        isPreviewing = !isPreviewing;
        if (isPreviewing) {
            previewTitle.textContent = titleInput.value || 'Untitled';
            previewCnt.innerHTML = editor.innerHTML || '<em>Nothing to preview.</em>';
            previewPanel.classList.remove('hidden');
            previewBtn.textContent = '✏️ Edit';
            document.getElementById('editor-card').style.display = 'none';
        } else {
            previewPanel.classList.add('hidden');
            previewBtn.textContent = '👁 Preview';
            document.getElementById('editor-card').style.display = '';
        }
    });

    // ── Autosave draft to localStorage ───────────────────────────────────────
    const DRAFT_KEY = `blog_draft_${editId || 'new'}`;
    function saveDraft() {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            title: titleInput.value,
            content: editor.innerHTML,
            tags: tagsInput.value,
        }));
        saveStatus.textContent = 'Draft saved';
        setTimeout(() => { saveStatus.textContent = ''; }, 2000);
    }

    let draftTimer;
    [titleInput, tagsInput].forEach(el =>
        el.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 1500); })
    );
    editor.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 1500); });

    // Restore draft if new post and draft exists
    if (!editId) {
        try {
            const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
            if (draft && (draft.title || draft.content)) {
                titleInput.value = draft.title || '';
                editor.innerHTML = draft.content || '';
                tagsInput.value = draft.tags || '';
                saveStatus.textContent = '✓ Draft restored';
                setTimeout(() => { saveStatus.textContent = ''; }, 2000);
            }
        } catch { }
    }

    // ── Load post for editing ─────────────────────────────────────────────────
    async function loadForEdit(id) {
        try {
            const res = await apiFetch(`/api/blogs/${id}`);
            const post = await res.json();
            if (post.author_id !== user.id) {
                showToast('You can only edit your own posts.', true);
                setTimeout(() => { window.location.href = 'blog.html'; }, 2000);
                return;
            }
            titleInput.value = post.title;
            editor.innerHTML = post.content;
            tagsInput.value = post.tags || '';
        } catch {
            showToast('Failed to load post.', true);
        }
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    publishBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const content = editor.innerHTML.trim();
        const tags = tagsInput.value.trim();

        if (!title) { showToast('Please add a title.', true); return; }
        if (!content || content === '<br>') { showToast('Content cannot be empty.', true); return; }

        publishBtn.disabled = true;
        publishBtn.textContent = editId ? 'Saving…' : 'Publishing…';

        try {
            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `/api/blogs/${editId}` : '/api/blogs';
            const res = await apiFetch(url, {
                method,
                body: JSON.stringify({ title, content, tags }),
            });
            const data = await res.json();

            localStorage.removeItem(DRAFT_KEY);
            showToast(editId ? '✓ Post updated!' : '🎉 Published!');
            setTimeout(() => {
                window.location.href = `post.html?id=${editId || data.id}`;
            }, 1200);
        } catch (err) {
            showToast('Failed to publish. Please try again.', true);
            publishBtn.disabled = false;
            publishBtn.textContent = editId ? '💾 Save changes' : 'Publish';
        }
    });

    // ── Delete ────────────────────────────────────────────────────────────────
    deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this post permanently?')) return;
        try {
            await apiFetch(`/api/blogs/${editId}`, { method: 'DELETE' });
            showToast('Post deleted.');
            setTimeout(() => { window.location.href = 'blog.html'; }, 1200);
        } catch {
            showToast('Failed to delete.', true);
        }
    });

    // ── Toast ─────────────────────────────────────────────────────────────────
    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.style.borderColor = isError ? 'rgba(248,113,113,0.4)' : 'rgba(99,102,241,0.4)';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }
})();
