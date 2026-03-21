// Preset Timeline Diff
(function () {
    const uploadArea = document.getElementById('tlUploadArea');
    const fileInput = document.getElementById('tlFileInput');
    const fileListEl = document.getElementById('tlFileList');
    const resultsEl = document.getElementById('tlResults');
    if (!uploadArea || !fileInput) return;

    const presets = []; // { name, data, prompts }

    // ─── 업로드 ───

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#d63384'; uploadArea.style.background = '#ffe5f7'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#ffb3d9'; uploadArea.style.background = '#fff5fa'; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#ffb3d9';
        uploadArea.style.background = '#fff5fa';
        if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) loadFiles(fileInput.files);
        fileInput.value = '';
    });

    function loadFiles(files) {
        const promises = [];
        for (const file of files) {
            if (!file.name.endsWith('.json')) continue;
            promises.push(new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (data.prompts && data.prompt_order) {
                            resolve({ name: file.name, data, prompts: buildPromptListWithLinkStatus(data) });
                        } else {
                            resolve(null);
                        }
                    } catch { resolve(null); }
                };
                reader.readAsText(file);
            }));
        }
        Promise.all(promises).then(results => {
            results.filter(Boolean).forEach(r => presets.push(r));
            renderFileList();
            if (presets.length >= 2) runDiff();
        });
    }

    function renderFileList() {
        let html = '';
        presets.forEach((p, i) => {
            html += `<div class="tl-file-item">`;
            html += `<span class="tl-file-num">${i + 1}</span>`;
            html += `<span class="tl-file-name">${esc(p.name)}</span>`;
            html += `<span class="tl-file-info">${p.prompts.length}개 프롬프트</span>`;
            html += `<button class="tl-file-remove" data-remove="${i}">✕</button>`;
            html += `</div>`;
        });
        if (presets.length < 2) {
            html += `<div class="tl-file-hint">${presets.length === 0 ? '파일을 올려주세요' : '1개 더 올려주세요'}</div>`;
        }
        fileListEl.innerHTML = html;

        fileListEl.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                presets.splice(parseInt(btn.dataset.remove), 1);
                renderFileList();
                if (presets.length >= 2) runDiff();
                else resultsEl.innerHTML = '';
            });
        });
    }

    // ─── Diff 엔진 ───

    function diffTwoPresets(oldPreset, newPreset) {
        const oldMap = new Map();
        oldPreset.prompts.forEach(p => {
            if (p.isLinked) oldMap.set(p.identifier, p);
        });
        const newMap = new Map();
        newPreset.prompts.forEach(p => {
            if (p.isLinked) newMap.set(p.identifier, p);
        });

        const changes = [];

        // 추가된 프롬프트
        newMap.forEach((p, id) => {
            if (!oldMap.has(id)) {
                changes.push({ type: 'added', identifier: id, prompt: p });
            }
        });

        // 삭제된 프롬프트
        oldMap.forEach((p, id) => {
            if (!newMap.has(id)) {
                changes.push({ type: 'removed', identifier: id, prompt: p });
            }
        });

        // 변경된 프롬프트
        newMap.forEach((newP, id) => {
            if (!oldMap.has(id)) return;
            const oldP = oldMap.get(id);
            const diffs = [];

            if ((oldP.name || '') !== (newP.name || '')) {
                diffs.push({ field: '이름', old: oldP.name || '', new: newP.name || '' });
            }
            if ((oldP.role || 'system') !== (newP.role || 'system')) {
                diffs.push({ field: '역할', old: oldP.role || 'system', new: newP.role || 'system' });
            }
            if (oldP.enabled !== newP.enabled) {
                diffs.push({ field: '활성화', old: oldP.enabled ? '켜짐' : '꺼짐', new: newP.enabled ? '켜짐' : '꺼짐' });
            }
            if ((oldP.content || '') !== (newP.content || '')) {
                diffs.push({ field: '내용', old: oldP.content || '', new: newP.content || '', isContent: true });
            }
            if ((oldP.injection_position ?? 0) !== (newP.injection_position ?? 0)) {
                diffs.push({ field: '삽입 위치', old: String(oldP.injection_position ?? 0), new: String(newP.injection_position ?? 0) });
            }
            if ((oldP.injection_depth ?? 0) !== (newP.injection_depth ?? 0)) {
                diffs.push({ field: 'Depth', old: String(oldP.injection_depth ?? 0), new: String(newP.injection_depth ?? 0) });
            }

            // 순서 변경
            const oldIdx = oldPreset.prompts.filter(x => x.isLinked).findIndex(x => x.identifier === id);
            const newIdx = newPreset.prompts.filter(x => x.isLinked).findIndex(x => x.identifier === id);
            if (oldIdx !== newIdx && oldIdx !== -1 && newIdx !== -1) {
                diffs.push({ field: '순서', old: `${oldIdx + 1}번째`, new: `${newIdx + 1}번째` });
            }

            if (diffs.length > 0) {
                changes.push({ type: 'modified', identifier: id, prompt: newP, oldPrompt: oldP, diffs });
            }
        });

        return changes;
    }

    // ─── 텍스트 diff (줄 단위) ───

    function lineDiff(oldText, newText) {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const result = [];

        // Simple LCS-based diff
        const m = oldLines.length;
        const n = newLines.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }

        // Backtrack
        let i = m, j = n;
        const ops = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                ops.unshift({ type: 'same', text: oldLines[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                ops.unshift({ type: 'add', text: newLines[j - 1] });
                j--;
            } else {
                ops.unshift({ type: 'del', text: oldLines[i - 1] });
                i--;
            }
        }

        return ops;
    }

    // ─── 렌더링 ───

    function runDiff() {
        let html = '';

        // 전체 요약
        html += '<div class="tl-timeline">';

        for (let i = 1; i < presets.length; i++) {
            const oldP = presets[i - 1];
            const newP = presets[i];
            const changes = diffTwoPresets(oldP, newP);

            const added = changes.filter(c => c.type === 'added').length;
            const removed = changes.filter(c => c.type === 'removed').length;
            const modified = changes.filter(c => c.type === 'modified').length;

            // 타임라인 구간 헤더
            html += '<div class="tl-step">';
            html += '<div class="tl-step-header">';
            html += `<div class="tl-step-files">`;
            html += `<span class="tl-step-from">${esc(oldP.name)}</span>`;
            html += `<span class="tl-step-arrow">→</span>`;
            html += `<span class="tl-step-to">${esc(newP.name)}</span>`;
            html += `</div>`;
            html += '<div class="tl-step-stats">';
            if (added > 0) html += `<span class="tl-stat added">+${added} 추가</span>`;
            if (removed > 0) html += `<span class="tl-stat removed">-${removed} 삭제</span>`;
            if (modified > 0) html += `<span class="tl-stat modified">~${modified} 수정</span>`;
            if (changes.length === 0) html += `<span class="tl-stat none">변경 없음</span>`;
            html += '</div>';
            html += '</div>';

            if (changes.length === 0) {
                html += '<div class="tl-no-changes">두 프리셋이 동일합니다.</div>';
            } else {
                // 변경 사항 목록
                changes.forEach(change => {
                    const name = change.prompt.name || change.prompt.identifier || '(이름 없음)';

                    html += `<div class="tl-change tl-${change.type}">`;
                    html += '<div class="tl-change-header">';

                    if (change.type === 'added') {
                        html += `<span class="tl-change-badge added">추가</span>`;
                        html += `<span class="tl-change-name">${esc(name)}</span>`;
                        html += `<span class="tl-change-role">${esc(change.prompt.role || 'system')}</span>`;
                    } else if (change.type === 'removed') {
                        html += `<span class="tl-change-badge removed">삭제</span>`;
                        html += `<span class="tl-change-name">${esc(name)}</span>`;
                        html += `<span class="tl-change-role">${esc(change.prompt.role || 'system')}</span>`;
                    } else {
                        html += `<span class="tl-change-badge modified">수정</span>`;
                        html += `<span class="tl-change-name">${esc(name)}</span>`;
                        html += `<span class="tl-change-role">${esc(change.prompt.role || 'system')}</span>`;
                    }
                    html += '</div>';

                    // 상세 변경 내용
                    if (change.type === 'added' && change.prompt.content) {
                        const preview = (change.prompt.content || '').substring(0, 200);
                        html += `<div class="tl-change-body">`;
                        html += `<pre class="tl-content-preview add-bg">${esc(preview)}${change.prompt.content.length > 200 ? '...' : ''}</pre>`;
                        html += `</div>`;
                    }
                    if (change.type === 'removed' && change.prompt.content) {
                        const preview = (change.prompt.content || '').substring(0, 200);
                        html += `<div class="tl-change-body">`;
                        html += `<pre class="tl-content-preview del-bg">${esc(preview)}${change.prompt.content.length > 200 ? '...' : ''}</pre>`;
                        html += `</div>`;
                    }
                    if (change.type === 'modified') {
                        html += '<div class="tl-change-body">';
                        change.diffs.forEach(d => {
                            if (d.isContent) {
                                // 내용 diff
                                html += `<div class="tl-diff-label">내용 변경:</div>`;
                                const ops = lineDiff(d.old, d.new);
                                html += '<pre class="tl-diff-block">';
                                ops.forEach(op => {
                                    const line = esc(op.text);
                                    if (op.type === 'del') html += `<span class="tl-diff-del">- ${line}</span>\n`;
                                    else if (op.type === 'add') html += `<span class="tl-diff-add">+ ${line}</span>\n`;
                                    else html += `  ${line}\n`;
                                });
                                html += '</pre>';
                            } else {
                                html += `<div class="tl-diff-field">`;
                                html += `<span class="tl-diff-field-name">${esc(d.field)}:</span> `;
                                html += `<span class="tl-diff-old">${esc(d.old)}</span>`;
                                html += ` → `;
                                html += `<span class="tl-diff-new">${esc(d.new)}</span>`;
                                html += `</div>`;
                            }
                        });
                        html += '</div>';
                    }

                    html += '</div>'; // tl-change
                });
            }

            html += '</div>'; // tl-step
        }

        html += '</div>'; // tl-timeline

        resultsEl.innerHTML = html;
    }

    function esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
