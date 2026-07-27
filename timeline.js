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
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--c-primary)'; uploadArea.style.background = 'var(--c-tint)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'var(--c-accent)'; uploadArea.style.background = 'var(--c-surface-tint)'; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--c-accent)';
        uploadArea.style.background = 'var(--c-surface-tint)';
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
            else resultsEl.innerHTML = '';
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
            html += `<div class="tl-file-hint">${presets.length === 0 ? '파일을 올려주세요 (2개 이상)' : '1개 더 올려주세요'}</div>`;
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

        const added = [];
        const removed = [];
        const modified = [];

        // 추가된 프롬프트
        newMap.forEach((p, id) => {
            if (!oldMap.has(id)) {
                added.push({ identifier: id, prompt: p });
            }
        });

        // 삭제된 프롬프트
        oldMap.forEach((p, id) => {
            if (!newMap.has(id)) {
                removed.push({ identifier: id, prompt: p });
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
                diffs.push({ field: '상태', old: oldP.enabled ? '켜짐' : '꺼짐', new: newP.enabled ? '켜짐' : '꺼짐' });
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

            const oldIdx = oldPreset.prompts.filter(x => x.isLinked).findIndex(x => x.identifier === id);
            const newIdx = newPreset.prompts.filter(x => x.isLinked).findIndex(x => x.identifier === id);
            if (oldIdx !== newIdx && oldIdx !== -1 && newIdx !== -1) {
                diffs.push({ field: '순서', old: `${oldIdx + 1}번째`, new: `${newIdx + 1}번째` });
            }

            if (diffs.length > 0) {
                modified.push({ identifier: id, prompt: newP, oldPrompt: oldP, diffs });
            }
        });

        return { added, removed, modified };
    }

    // ─── 텍스트 diff (줄 단위) ───

    function lineDiff(oldText, newText) {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');

        const m = oldLines.length;
        const n = newLines.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }

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

        // 전체 흐름 요약 (상단)
        html += '<div class="tl-flow-summary">';
        html += '<div class="tl-flow-title">비교 흐름</div>';
        html += '<div class="tl-flow-bar">';
        presets.forEach((p, i) => {
            html += `<span class="tl-flow-node${i === 0 ? ' first' : ''}${i === presets.length - 1 ? ' last' : ''}">${esc(p.name.replace('.json', ''))}</span>`;
            if (i < presets.length - 1) {
                const diff = diffTwoPresets(presets[i], presets[i + 1]);
                const total = diff.added.length + diff.removed.length + diff.modified.length;
                html += `<span class="tl-flow-arrow">${total > 0 ? total + '건 변경' : '동일'}</span>`;
            }
        });
        html += '</div>';
        html += '</div>';

        // 각 비교 구간 (탭으로 전환)
        html += '<div class="tl-tabs">';
        for (let i = 1; i < presets.length; i++) {
            const shortFrom = presets[i - 1].name.replace('.json', '');
            const shortTo = presets[i].name.replace('.json', '');
            html += `<button class="tl-tab${i === 1 ? ' active' : ''}" data-tl-tab="${i}">${shortFrom} → ${shortTo}</button>`;
        }
        html += '</div>';

        for (let i = 1; i < presets.length; i++) {
            const oldP = presets[i - 1];
            const newP = presets[i];
            const diff = diffTwoPresets(oldP, newP);
            const totalChanges = diff.added.length + diff.removed.length + diff.modified.length;

            html += `<div class="tl-panel${i === 1 ? ' active' : ''}" data-tl-panel="${i}">`;

            // 요약 카드
            html += '<div class="tl-summary-cards">';
            html += `<div class="tl-summary-card added"><div class="tl-summary-num">${diff.added.length}</div><div class="tl-summary-label">추가</div></div>`;
            html += `<div class="tl-summary-card removed"><div class="tl-summary-num">${diff.removed.length}</div><div class="tl-summary-label">삭제</div></div>`;
            html += `<div class="tl-summary-card modified"><div class="tl-summary-num">${diff.modified.length}</div><div class="tl-summary-label">수정</div></div>`;
            html += '</div>';

            if (totalChanges === 0) {
                html += '<div class="tl-no-changes">두 프리셋이 동일합니다.</div>';
            } else {
                // 추가된 프롬프트
                if (diff.added.length > 0) {
                    html += '<div class="tl-section">';
                    html += `<div class="tl-section-header added">추가된 프롬프트 (${diff.added.length})</div>`;
                    diff.added.forEach(item => {
                        const name = item.prompt.name || item.identifier || '(이름 없음)';
                        html += `<div class="tl-item added">`;
                        html += `<div class="tl-item-header">`;
                        html += `<span class="tl-item-name">${esc(name)}</span>`;
                        html += `<span class="tl-item-role">${esc(item.prompt.role || 'system')}</span>`;
                        html += `</div>`;
                        if (item.prompt.content) {
                            const preview = item.prompt.content.substring(0, 150);
                            html += `<pre class="tl-item-preview">${esc(preview)}${item.prompt.content.length > 150 ? '...' : ''}</pre>`;
                        }
                        html += `</div>`;
                    });
                    html += '</div>';
                }

                // 삭제된 프롬프트
                if (diff.removed.length > 0) {
                    html += '<div class="tl-section">';
                    html += `<div class="tl-section-header removed">삭제된 프롬프트 (${diff.removed.length})</div>`;
                    diff.removed.forEach(item => {
                        const name = item.prompt.name || item.identifier || '(이름 없음)';
                        html += `<div class="tl-item removed">`;
                        html += `<div class="tl-item-header">`;
                        html += `<span class="tl-item-name">${esc(name)}</span>`;
                        html += `<span class="tl-item-role">${esc(item.prompt.role || 'system')}</span>`;
                        html += `</div>`;
                        if (item.prompt.content) {
                            const preview = item.prompt.content.substring(0, 150);
                            html += `<pre class="tl-item-preview">${esc(preview)}${item.prompt.content.length > 150 ? '...' : ''}</pre>`;
                        }
                        html += `</div>`;
                    });
                    html += '</div>';
                }

                // 수정된 프롬프트
                if (diff.modified.length > 0) {
                    html += '<div class="tl-section">';
                    html += `<div class="tl-section-header modified">수정된 프롬프트 (${diff.modified.length})</div>`;
                    diff.modified.forEach(item => {
                        const name = item.prompt.name || item.identifier || '(이름 없음)';
                        html += `<div class="tl-item modified">`;
                        html += `<div class="tl-item-header">`;
                        html += `<span class="tl-item-name">${esc(name)}</span>`;
                        html += `<span class="tl-item-role">${esc(item.prompt.role || 'system')}</span>`;
                        html += `<button class="tl-item-toggle" data-tl-expand>상세보기</button>`;
                        html += `</div>`;

                        // 간단 요약 (항상 보임)
                        html += `<div class="tl-item-brief">`;
                        item.diffs.forEach(d => {
                            if (!d.isContent) {
                                html += `<span class="tl-brief-tag">${esc(d.field)}: ${esc(d.old)} → ${esc(d.new)}</span>`;
                            } else {
                                html += `<span class="tl-brief-tag">내용 변경됨</span>`;
                            }
                        });
                        html += `</div>`;

                        // 상세 diff (접힘)
                        html += `<div class="tl-item-detail" style="display:none;">`;
                        item.diffs.forEach(d => {
                            if (d.isContent) {
                                const ops = lineDiff(d.old, d.new);
                                html += '<pre class="tl-diff-block">';
                                ops.forEach(op => {
                                    const line = esc(op.text);
                                    if (op.type === 'del') html += `<span class="tl-diff-del">- ${line}</span>\n`;
                                    else if (op.type === 'add') html += `<span class="tl-diff-add">+ ${line}</span>\n`;
                                    else html += `  ${line}\n`;
                                });
                                html += '</pre>';
                            }
                        });
                        html += `</div>`;

                        html += `</div>`;
                    });
                    html += '</div>';
                }
            }

            html += '</div>'; // tl-panel
        }

        resultsEl.innerHTML = html;

        // 탭 전환
        resultsEl.querySelectorAll('[data-tl-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                resultsEl.querySelectorAll('.tl-tab').forEach(t => t.classList.remove('active'));
                resultsEl.querySelectorAll('.tl-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                resultsEl.querySelector(`[data-tl-panel="${tab.dataset.tlTab}"]`).classList.add('active');
            });
        });

        // 상세보기 토글
        resultsEl.querySelectorAll('[data-tl-expand]').forEach(btn => {
            btn.addEventListener('click', () => {
                const detail = btn.closest('.tl-item').querySelector('.tl-item-detail');
                if (detail.style.display === 'none') {
                    detail.style.display = 'block';
                    btn.textContent = '접기';
                } else {
                    detail.style.display = 'none';
                    btn.textContent = '상세보기';
                }
            });
        });
    }

    function esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
