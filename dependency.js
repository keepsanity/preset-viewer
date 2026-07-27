(function() {
    const uploadArea = document.getElementById('depUploadArea');
    const fileInput = document.getElementById('depFileInput');
    const depResults = document.getElementById('depResults');
    if (!uploadArea || !fileInput) return;

    // ─── 업로드 ───

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--c-primary)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'var(--c-accent)'; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--c-accent)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const el = document.getElementById('depFilename');
                if (el) el.textContent = file.name;
                analyzeAndRender(data);
            } catch(err) {
                depResults.innerHTML = '<div class="dep-empty">파일을 읽을 수 없습니다.</div>';
            }
        };
        reader.readAsText(file);
    }

    // ─── 색상 팔레트 ───

    const COLORS = [
        '#e91e63', '#7b1fa2', '#3f51b5', '#0288d1', '#00897b',
        '#43a047', '#ef6c00', '#d32f2f', '#5c6bc0', '#00acc1',
        '#6d4c41', '#546e7a'
    ];
    let colorIdx = 0;
    const varColors = new Map();

    function getVarColor(varName) {
        if (!varColors.has(varName)) {
            varColors.set(varName, COLORS[colorIdx % COLORS.length]);
            colorIdx++;
        }
        return varColors.get(varName);
    }

    // ─── 변수 파싱 ───

    function parseDotNotation(content) {
        const sets = new Set();
        const gets = new Set();
        let i = 0;
        while (i < content.length - 3) {
            if (content[i] === '{' && content[i+1] === '{') {
                let j = i + 2;
                while (j < content.length && content[j] === ' ') j++;
                if (j < content.length && content[j] === '.') {
                    j++;
                    while (j < content.length && content[j] === ' ') j++;
                    let name = '';
                    while (j < content.length && /[a-zA-Z0-9_]/.test(content[j])) {
                        name += content[j]; j++;
                    }
                    if (name) {
                        while (j < content.length && content[j] === ' ') j++;
                        if (content[j] === '=') {
                            sets.add(name);
                            // 값 안의 GET 참조 탐색 (중첩 브레이스 처리)
                            let depth = 2;
                            let valStart = j + 1;
                            j = valStart;
                            while (j < content.length && depth > 0) {
                                if (content[j] === '{') depth++;
                                else if (content[j] === '}') depth--;
                                j++;
                            }
                            const value = content.substring(valStart, j);
                            const inner = /\{\{\s*\.\s*([a-zA-Z_]\w*)\s*\}\}/g;
                            let im;
                            while ((im = inner.exec(value)) !== null) gets.add(im[1]);
                            // getvar in value
                            const innerGet = /\{\{get(?:global)?var::([^}]+)\}\}/g;
                            while ((im = innerGet.exec(value)) !== null) gets.add(im[1].trim());
                            i = j;
                            continue;
                        } else if (content[j] === '}' && j+1 < content.length && content[j+1] === '}') {
                            gets.add(name);
                            i = j + 2;
                            continue;
                        }
                    }
                }
            }
            i++;
        }
        return { sets, gets };
    }

    function findSetVars(content) {
        const vars = new Set();
        let m;
        const r1 = /\{\{set(?:global)?var::([^:}]+)::/g;
        while ((m = r1.exec(content)) !== null) vars.add(m[1].trim());
        const r2 = /\{\{setvar\s+([^}]+)\}\}/g;
        while ((m = r2.exec(content)) !== null) vars.add(m[1].trim());
        const r3 = /\{\{(?:add|inc|dec)(?:global)?var::([^:}]+)/g;
        while ((m = r3.exec(content)) !== null) vars.add(m[1].trim());
        parseDotNotation(content).sets.forEach(v => vars.add(v));
        return vars;
    }

    function findGetVars(content) {
        const vars = new Set();
        let m;
        const r1 = /\{\{get(?:global)?var::([^}]+)\}\}/g;
        while ((m = r1.exec(content)) !== null) vars.add(m[1].trim());
        const r2 = /\{\{\s*if\s+\.([a-zA-Z_]\w*)\s*\}\}/g;
        while ((m = r2.exec(content)) !== null) vars.add(m[1].trim());
        parseDotNotation(content).gets.forEach(v => vars.add(v));
        return vars;
    }

    function findGetsInBlockSetvar(content) {
        const gets = new Set();
        const r = /\{\{setvar\s+[^}]+\}\}([\s\S]*?)\{\{\/setvar\}\}/g;
        let m;
        while ((m = r.exec(content)) !== null) {
            findGetVars(m[1]).forEach(v => gets.add(v));
        }
        return gets;
    }

    // ─── 분석 ───

    let varMap = new Map();

    function analyzeAndRender(data) {
        colorIdx = 0;
        varColors.clear();
        varMap = new Map();

        const prompts = buildPromptListWithLinkStatus(data);

        function ensureVar(name) {
            if (!varMap.has(name)) varMap.set(name, { setBy: [], usedBy: [] });
            return varMap.get(name);
        }

        prompts.forEach((p, idx) => {
            if (!p.isLinked) return;
            const content = p.content || '';

            const sets = findSetVars(content);
            const gets = findGetVars(content);
            const blockGets = findGetsInBlockSetvar(content);
            blockGets.forEach(v => { if (!sets.has(v)) gets.add(v); });

            sets.forEach(v => ensureVar(v).setBy.push({ idx, prompt: p }));
            gets.forEach(v => ensureVar(v).usedBy.push({ idx, prompt: p }));

            p._sets = sets;
            p._gets = gets;
        });

        render(prompts, varMap);
    }

    // ─── 렌더링 ───

    let activeView = 'variable';

    function render(prompts, varMap) {
        let html = '';
        const linked = prompts.filter(p => p.isLinked);
        const total = varMap.size;
        const connected = [...varMap.values()].filter(v => v.setBy.length > 0 && v.usedBy.length > 0).length;
        const orphanSet = [...varMap.values()].filter(v => v.setBy.length > 0 && v.usedBy.length === 0).length;
        const orphanGet = [...varMap.values()].filter(v => v.setBy.length === 0 && v.usedBy.length > 0).length;

        // 요약
        html += '<div class="dep-summary">';
        html += `<div class="dep-summary-row"><span class="dep-summary-label">전체 매크로</span><span class="dep-summary-value">${total}개</span></div>`;
        html += `<div class="dep-summary-row"><span class="dep-summary-label">연결됨 (설정+사용)</span><span class="dep-summary-value dep-connected">${connected}개</span></div>`;
        if (orphanSet > 0) html += `<div class="dep-summary-row"><span class="dep-summary-label">미사용 (설정만 됨)</span><span class="dep-summary-value dep-orphan">${orphanSet}개</span></div>`;
        if (orphanGet > 0) html += `<div class="dep-summary-row"><span class="dep-summary-label">미설정 (사용만 됨)</span><span class="dep-summary-value dep-warning">${orphanGet}개</span></div>`;
        html += '</div>';

        // 탭
        html += '<div class="dep-view-tabs">';
        html += `<button class="dep-view-tab${activeView === 'variable' ? ' active' : ''}" data-depview="variable">🔗 매크로별 보기</button>`;
        html += `<button class="dep-view-tab${activeView === 'prompt' ? ' active' : ''}" data-depview="prompt">📋 프롬프트별 보기</button>`;
        html += '</div>';

        // ─── 변수별 보기 ───
        html += `<div class="dep-view${activeView === 'variable' ? ' active' : ''}" id="dep-view-variable">`;
        html += '<div class="dep-guide">각 매크로가 어떤 프롬프트에서 설정되고, 어디서 쓰이는지 보여줍니다.<br>매크로 이름을 클릭하면 관련된 곳이 강조됩니다.</div>';

        if (varMap.size === 0) {
            html += '<div class="dep-empty">매크로가 사용되지 않은 프리셋입니다.</div>';
        } else {
            const sorted = [...varMap.entries()].sort((a, b) => {
                const ac = (a[1].setBy.length > 0 && a[1].usedBy.length > 0) ? 0 : 1;
                const bc = (b[1].setBy.length > 0 && b[1].usedBy.length > 0) ? 0 : 1;
                if (ac !== bc) return ac - bc;
                return (b[1].setBy.length + b[1].usedBy.length) - (a[1].setBy.length + a[1].usedBy.length);
            });

            sorted.forEach(([varName, info]) => {
                const color = getVarColor(varName);
                const isConn = info.setBy.length > 0 && info.usedBy.length > 0;
                const isOrphanS = info.setBy.length > 0 && info.usedBy.length === 0;
                const isOrphanG = info.setBy.length === 0 && info.usedBy.length > 0;

                html += `<div class="dep-var-card" data-var="${esc(varName)}">`;

                // 헤더
                html += '<div class="dep-var-header">';
                html += `<span class="dep-var-dot" style="background:${color}"></span>`;
                html += `<code class="dep-var-name-label">.${esc(varName)}</code>`;
                if (isConn) html += '<span class="dep-var-badge connected">연결됨</span>';
                if (isOrphanS) html += '<span class="dep-var-badge orphan-set">미사용</span>';
                if (isOrphanG) html += '<span class="dep-var-badge orphan-get">미설정 ⚠️</span>';
                html += '</div>';

                // 흐름도
                html += '<div class="dep-var-flow">';

                // 만드는 곳
                html += '<div class="dep-flow-col">';
                html += '<div class="dep-flow-label">만드는 곳</div>';
                if (info.setBy.length === 0) {
                    html += '<div class="dep-flow-empty">없음</div>';
                } else {
                    info.setBy.forEach(({ idx, prompt }) => {
                        const pn = prompt.name || prompt.identifier || '(이름 없음)';
                        html += `<div class="dep-flow-tag setter" data-pidx="${idx}">${esc(pn)}</div>`;
                    });
                }
                html += '</div>';

                html += '<div class="dep-flow-arrow">→</div>';

                // 변수 버블
                html += `<div class="dep-flow-bubble" style="border-color:${color}; color:${color}">.${esc(varName)}</div>`;

                html += '<div class="dep-flow-arrow">→</div>';

                // 쓰이는 곳
                html += '<div class="dep-flow-col">';
                html += '<div class="dep-flow-label">쓰이는 곳</div>';
                if (info.usedBy.length === 0) {
                    html += '<div class="dep-flow-empty">없음</div>';
                } else {
                    info.usedBy.forEach(({ idx, prompt }) => {
                        const pn = prompt.name || prompt.identifier || '(이름 없음)';
                        html += `<div class="dep-flow-tag getter" data-pidx="${idx}">${esc(pn)}</div>`;
                    });
                }
                html += '</div>';
                html += '</div>'; // flow

                // 영향도
                if (isConn) {
                    const setters = info.setBy.map(s => s.prompt.name || s.prompt.identifier).join(', ');
                    const getters = info.usedBy.map(u => u.prompt.name || u.prompt.identifier).join(', ');
                    html += `<div class="dep-var-impact">💡 <strong>${esc(setters)}</strong>을(를) 끄면 → <strong>${esc(getters)}</strong>에 영향</div>`;
                }

                html += '</div>'; // card
            });
        }
        html += '</div>'; // variable view

        // ─── 프롬프트별 보기 ───
        html += `<div class="dep-view${activeView === 'prompt' ? ' active' : ''}" id="dep-view-prompt">`;
        html += '<div class="dep-guide">각 프롬프트가 설정하거나 사용하는 매크로를 보여줍니다.<br>같은 색 = 같은 매크로입니다. 태그를 클릭하면 관련된 곳이 강조됩니다.</div>';

        let num = 0;
        linked.forEach(p => {
            const idx = prompts.indexOf(p);
            num++;
            const sets = p._sets || new Set();
            const gets = p._gets || new Set();
            if (sets.size === 0 && gets.size === 0) return;

            const name = p.name || p.identifier || '(이름 없음)';
            const role = p.role || 'system';

            html += `<div class="dep-prompt-card ${p.enabled ? 'enabled' : 'disabled'}" data-pidx="${idx}">`;
            html += '<div class="dep-prompt-header">';
            html += `<span class="dep-prompt-num">${num}</span>`;
            html += `<span class="dep-prompt-name">${esc(name)}</span>`;
            html += `<span class="dep-prompt-role">${esc(role.toUpperCase())}</span>`;
            html += `<span class="dep-prompt-status ${p.enabled ? 'on' : 'off'}">${p.enabled ? '활성화' : '비활성화'}</span>`;
            html += '</div>';

            html += '<div class="dep-prompt-body">';

            if (sets.size > 0) {
                html += '<div class="dep-prompt-section">';
                html += '<span class="dep-section-label">설정하는 매크로</span>';
                html += '<div class="dep-tags">';
                sets.forEach(v => {
                    const c = getVarColor(v);
                    html += `<span class="dep-tag" data-var="${esc(v)}" style="--tc:${c}">.${esc(v)}</span>`;
                });
                html += '</div></div>';
            }

            if (gets.size > 0) {
                html += '<div class="dep-prompt-section">';
                html += '<span class="dep-section-label">사용하는 매크로</span>';
                html += '<div class="dep-tags">';
                gets.forEach(v => {
                    const c = getVarColor(v);
                    html += `<span class="dep-tag" data-var="${esc(v)}" style="--tc:${c}">.${esc(v)}</span>`;
                });
                html += '</div></div>';
            }

            // 영향도
            if (p.enabled && sets.size > 0) {
                const affected = new Set();
                sets.forEach(v => {
                    const info = varMap.get(v);
                    if (info) info.usedBy.forEach(u => {
                        if (u.idx !== idx) affected.add(u.prompt.name || u.prompt.identifier);
                    });
                });
                if (affected.size > 0) {
                    html += `<div class="dep-prompt-impact">💡 끄면 영향받는 프롬프트: <strong>${esc([...affected].join(', '))}</strong></div>`;
                }
            }

            html += '</div></div>';
        });

        html += '</div>'; // prompt view

        depResults.innerHTML = html;

        // ─── 이벤트 ───

        // 탭 전환
        depResults.querySelectorAll('.dep-view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                depResults.querySelectorAll('.dep-view-tab').forEach(t => t.classList.remove('active'));
                depResults.querySelectorAll('.dep-view').forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                activeView = tab.dataset.depview;
                document.getElementById('dep-view-' + tab.dataset.depview).classList.add('active');
            });
        });

        // 변수 하이라이트 (태그 클릭)
        depResults.querySelectorAll('.dep-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleHighlight(tag.dataset.var);
            });
        });

        // 변수 카드 클릭 하이라이트
        depResults.querySelectorAll('.dep-var-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.dep-tag, .dep-flow-tag')) return;
                toggleHighlight(card.dataset.var);
            });
        });
    }

    let highlightedVar = null;

    function toggleHighlight(varName) {
        // 같은 변수 다시 클릭하면 해제
        if (highlightedVar === varName) {
            depResults.querySelectorAll('.dep-hl').forEach(el => el.classList.remove('dep-hl'));
            highlightedVar = null;
            return;
        }
        highlightedVar = varName;
        depResults.querySelectorAll('.dep-hl').forEach(el => el.classList.remove('dep-hl'));
        depResults.querySelectorAll(`[data-var="${varName}"]`).forEach(el => el.classList.add('dep-hl'));
    }

    function esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
