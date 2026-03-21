// Preset Simulator
(function () {
    const simUploadArea = document.getElementById('macroUploadArea');
    const simFileInput = document.getElementById('macroFileInput');
    const simFilename = document.getElementById('macroFilename');
    const simResults = document.getElementById('macroResults');

    // Upload events
    simUploadArea.addEventListener('click', () => simFileInput.click());

    simUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        simUploadArea.style.borderColor = '#d63384';
        simUploadArea.style.background = '#ffe5f7';
    });

    simUploadArea.addEventListener('dragleave', () => {
        simUploadArea.style.borderColor = '#ffb3d9';
        simUploadArea.style.background = '#fff5fa';
    });

    simUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        simUploadArea.style.borderColor = '#ffb3d9';
        simUploadArea.style.background = '#fff5fa';
        if (e.dataTransfer.files.length > 0) loadSimFile(e.dataTransfer.files[0]);
    });

    simFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) loadSimFile(e.target.files[0]);
    });

    function loadSimFile(file) {
        if (!file.name.endsWith('.json')) return;
        simFilename.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                simulatePreset(data, file.name);
            } catch (err) {
                simResults.innerHTML = '<div class="sim-empty">JSON 파싱 오류: ' + escapeHtml(err.message) + '</div>';
            }
        };
        reader.readAsText(file);
    }

    // ─── 유틸 ───

    // {{ 뒤에 공백과 점이 오는지 체크 ({{. / {{ . / {{  . 등)
    function isDotNotationAt(content, pos) {
        let j = pos;
        while (j < content.length && content[j] === ' ') j++;
        return j < content.length && content[j] === '.';
    }

    // {{ 뒤에서 점+공백을 건너뛰고 변수명 시작 위치 반환
    function skipToDotVarName(content, pos) {
        let j = pos; // pos is right after {{
        while (j < content.length && content[j] === ' ') j++; // skip spaces
        if (j < content.length && content[j] === '.') j++; // skip dot
        while (j < content.length && content[j] === ' ') j++; // skip spaces after dot
        return j;
    }

    // ─── 변수 치환 엔진 ───

    function resolveVariables(content, vars) {
        let result = content;
        let changed = true;
        let iterations = 0;

        // 반복 치환 (변수가 다른 변수를 참조할 수 있으므로)
        while (changed && iterations < 10) {
            changed = false;
            iterations++;

            // {{if .varname}} / {{ if .varname }}...{{/if}} 조건문 처리
            result = result.replace(/\{\{\s*if\s+\.\s*([a-zA-Z_]\w*)\s*\}\}([\s\S]*?)\{\{\s*\/\s*if\s*\}\}/gi, (match, name, body) => {
                changed = true;
                const val = vars.has(name) ? vars.get(name) : '';
                // 값이 있으면(비어있지 않으면) body 출력, 없으면 제거
                return val && val.trim() ? body : '';
            });

            // {{.varname}} / {{. varname}} / {{ .varname }} → 값 치환 (없는 변수도 빈 값으로)
            result = result.replace(/\{\{\s*\.\s*([a-zA-Z_]\w*)\s*\}\}/g, (match, name) => {
                changed = true;
                return vars.has(name) ? vars.get(name) : '';
            });

            // {{getvar::name}} → 값 치환
            result = result.replace(/\{\{getvar::([^}]+)\}\}/gi, (match, name) => {
                changed = true;
                return vars.has(name.trim()) ? vars.get(name.trim()) : '';
            });

            // {{getglobalvar::name}} → 값 치환
            result = result.replace(/\{\{getglobalvar::([^}]+)\}\}/gi, (match, name) => {
                const key = 'global::' + name.trim();
                changed = true;
                return vars.has(key) ? vars.get(key) : '';
            });
        }

        return result;
    }

    // 프롬프트 내의 setvar 매크로를 실행하여 변수에 저장
    function processSetOperations(content, vars) {
        // {{setvar::name::value}}
        content.replace(/\{\{setvar::([^:}]+)::([^}]*)\}\}/gi, (m, name, value) => {
            vars.set(name.trim(), value);
        });

        // {{setglobalvar::name::value}}
        content.replace(/\{\{setglobalvar::([^:}]+)::([^}]*)\}\}/gi, (m, name, value) => {
            vars.set('global::' + name.trim(), value);
        });

        // {{setvar name}}content{{/setvar}}
        content.replace(/\{\{setvar\s+([^}]+)\}\}([\s\S]*?)\{\{\/setvar\}\}/gi, (m, name, value) => {
            vars.set(name.trim(), value.trim());
        });

        // {{setglobalvar name}}content{{/setglobalvar}}
        content.replace(/\{\{setglobalvar\s+([^}]+)\}\}([\s\S]*?)\{\{\/setglobalvar\}\}/gi, (m, name, value) => {
            vars.set('global::' + name.trim(), value.trim());
        });

        // dot notation: {{.name =value}} (중첩 지원)
        parseDotSetOperations(content, vars);
    }

    // dot notation SET 파서 (중첩 {{}} 지원)
    function parseDotSetOperations(content, vars) {
        let i = 0;
        while (i < content.length - 3) {
            if (content[i] === '{' && content[i + 1] === '{' && isDotNotationAt(content, i + 2)) {
                i = skipToDotVarName(content, i + 2);
                let varName = '';
                while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) {
                    varName += content[i];
                    i++;
                }
                if (!varName) continue;

                while (i < content.length && content[i] === ' ') i++;

                if (i < content.length - 1 && content[i] === '}' && content[i + 1] === '}') {
                    i += 2; // get — skip
                } else if (content[i] === '=') {
                    i++;
                    while (i < content.length && content[i] === ' ') i++;
                    let value = '';
                    let depth = 1;
                    while (i < content.length && depth > 0) {
                        if (content[i] === '{' && i + 1 < content.length && content[i + 1] === '{') {
                            depth++; value += '{{'; i += 2;
                        } else if (content[i] === '}' && i + 1 < content.length && content[i + 1] === '}') {
                            depth--;
                            if (depth === 0) { i += 2; } else { value += '}}'; i += 2; }
                        } else {
                            value += content[i]; i++;
                        }
                    }
                    vars.set(varName, value.trim());
                } else {
                    continue;
                }
            } else {
                i++;
            }
        }
    }

    // set/block/dot set 매크로 라인을 제거하고 실제 출력될 내용만 남기기
    function stripSetMacros(content) {
        let result = content;
        // {{setvar::name::value}}
        result = result.replace(/\{\{setvar::([^:}]+)::([^}]*)\}\}/gi, '');
        // {{setglobalvar::name::value}}
        result = result.replace(/\{\{setglobalvar::([^:}]+)::([^}]*)\}\}/gi, '');
        // {{setvar name}}...{{/setvar}}
        result = result.replace(/\{\{setvar\s+([^}]+)\}\}[\s\S]*?\{\{\/setvar\}\}/gi, '');
        // {{setglobalvar name}}...{{/setglobalvar}}
        result = result.replace(/\{\{setglobalvar\s+([^}]+)\}\}[\s\S]*?\{\{\/setglobalvar\}\}/gi, '');
        // {{addvar::name::value}}, {{incvar::name}}, {{decvar::name}} 등
        result = result.replace(/\{\{(addvar|addglobalvar|incvar|decvar|incglobalvar|decglobalvar)::[^}]*\}\}/gi, '');
        // {{trim}}
        result = result.replace(/\{\{trim\}\}/gi, '');
        // {{// comment}} 주석 제거 (내부에 }가 있을 수 있으므로 brace depth 파싱)
        result = stripComments(result);
        // dot notation set: {{.name =...}} (중첩 지원)
        result = stripDotSetNotation(result);
        return result;
    }

    // {{// ...}} 주석 제거 (내부에 중괄호가 있을 수 있음)
    function stripComments(content) {
        let result = '';
        let i = 0;
        while (i < content.length) {
            if (i + 4 < content.length && content[i] === '{' && content[i + 1] === '{' && content[i + 2] === '/' && content[i + 3] === '/') {
                // {{// 발견 — 매칭 }} 찾기
                let j = i + 4;
                let depth = 1;
                while (j < content.length && depth > 0) {
                    if (content[j] === '{' && j + 1 < content.length && content[j + 1] === '{') { depth++; j += 2; }
                    else if (content[j] === '}' && j + 1 < content.length && content[j + 1] === '}') { depth--; j += 2; }
                    else { j++; }
                }
                i = j; // skip entire comment
            } else {
                result += content[i];
                i++;
            }
        }
        return result;
    }

    function stripDotSetNotation(content) {
        let result = '';
        let i = 0;
        while (i < content.length) {
            if (i < content.length - 3 && content[i] === '{' && content[i + 1] === '{' && isDotNotationAt(content, i + 2)) {
                // 잠재적 dot notation
                let j = skipToDotVarName(content, i + 2);
                let varName = '';
                while (j < content.length && /[a-zA-Z0-9_]/.test(content[j])) {
                    varName += content[j]; j++;
                }
                if (!varName) { result += content[i]; i++; continue; }
                while (j < content.length && content[j] === ' ') j++;

                if (content[j] === '=') {
                    // set — 매칭되는 }} 까지 건너뛰기
                    j++;
                    let depth = 1;
                    while (j < content.length && depth > 0) {
                        if (content[j] === '{' && j + 1 < content.length && content[j + 1] === '{') { depth++; j += 2; }
                        else if (content[j] === '}' && j + 1 < content.length && content[j + 1] === '}') { depth--; j += 2; }
                        else { j++; }
                    }
                    i = j; // skip entire set macro
                } else {
                    // get — 유지
                    result += content[i];
                    i++;
                }
            } else {
                result += content[i];
                i++;
            }
        }
        return result;
    }

    // ─── 시뮬레이션 실행 ───

    // 현재 시뮬레이션 상태 저장 (토글 시 재실행용)
    let currentPrompts = null;
    let currentFileName = '';

    function simulatePreset(data, fileName) {
        if (!data.prompts || !data.prompt_order) {
            simResults.innerHTML = '<div class="sim-empty">프리셋 형식이 올바르지 않습니다.</div>';
            return;
        }

        currentPrompts = buildPromptListWithLinkStatus(data);
        currentFileName = fileName;
        runSimulation();
    }

    function runSimulation() {
        const vars = new Map();

        // 1단계: 활성화된 프롬프트의 set 연산을 순서대로 실행
        currentPrompts.forEach(p => {
            if (!p.enabled) return;
            processSetOperations(p.content || '', vars);
        });

        // 2단계: 변수 값 안의 참조도 치환
        let resolvePass = 0;
        while (resolvePass < 5) {
            let anyChanged = false;
            vars.forEach((value, key) => {
                const resolved = resolveVariables(value, vars);
                if (resolved !== value) {
                    vars.set(key, resolved);
                    anyChanged = true;
                }
            });
            if (!anyChanged) break;
            resolvePass++;
        }

        renderSimulator(currentPrompts, vars, currentFileName);
    }

    // ─── 렌더링 ───

    let activeViewTab = 'flow'; // 현재 활성 탭 기억

    function renderSimulator(prompts, vars, fileName) {
        const enabledPrompts = prompts.filter(p => p.enabled && p.isLinked);
        const disabledPrompts = prompts.filter(p => !p.enabled && p.isLinked);
        const unlinkedPrompts = prompts.filter(p => !p.isLinked);

        let html = '';

        // 요약
        html += '<div class="sim-summary">';
        html += `<div class="sim-summary-row"><span class="sim-summary-label">전체 프롬프트</span><span class="sim-summary-value">${prompts.length}개</span></div>`;
        html += `<div class="sim-summary-row"><span class="sim-summary-label">활성화 (실제 전송)</span><span class="sim-summary-value sim-active">${enabledPrompts.length}개</span></div>`;
        html += `<div class="sim-summary-row"><span class="sim-summary-label">비활성화</span><span class="sim-summary-value sim-inactive">${disabledPrompts.length}개</span></div>`;
        if (vars.size > 0) html += `<div class="sim-summary-row"><span class="sim-summary-label">변수</span><span class="sim-summary-value">${vars.size}개</span></div>`;
        html += '</div>';

        // 뷰 전환 탭
        html += '<div class="sim-view-tabs">';
        html += `<button class="sim-view-tab${activeViewTab === 'flow' ? ' active' : ''}" data-view="flow">📋 프롬프트 순서</button>`;
        html += `<button class="sim-view-tab${activeViewTab === 'final' ? ' active' : ''}" data-view="final">📨 최종 결과</button>`;
        if (vars.size > 0) html += `<button class="sim-view-tab${activeViewTab === 'vars' ? ' active' : ''}" data-view="vars">🔧 변수 목록</button>`;
        html += '</div>';

        // ─── 뷰 1: 프롬프트 순서 ───
        html += `<div class="sim-view${activeViewTab === 'flow' ? ' active' : ''}" id="sim-view-flow">`;
        html += '<div class="sim-guide">prompt_order 순서대로 표시됩니다. 토글로 프롬프트를 켜고 끄면 결과가 바로 반영됩니다.</div>';

        prompts.forEach((p, idx) => {
            if (!p.isLinked) return;
            const name = p.name || p.identifier || '(이름 없음)';
            const role = p.role || 'system';
            const isEnabled = p.enabled;
            const content = p.content || '';

            // 변수 치환 & set 매크로 제거
            let resolved = stripSetMacros(content);
            resolved = resolveVariables(resolved, vars);
            resolved = resolved.replace(/\n{3,}/g, '\n\n').trim();

            const hasContent = resolved.length > 0;
            const preview = resolved.length > 120 ? resolved.substring(0, 120) + '...' : resolved;

            html += `<div class="sim-prompt ${isEnabled ? 'enabled' : 'disabled'}">`;
            html += `<div class="sim-prompt-header">`;
            html += `<label class="sim-toggle"><input type="checkbox" ${isEnabled ? 'checked' : ''} data-toggle-idx="${idx}"><span class="sim-toggle-slider"></span></label>`;
            html += `<span class="sim-prompt-name">${escapeHtml(name)}</span>`;
            if (p.injection_position === 1) {
                const d = p.injection_depth ?? '?';
                const o = p.injection_order ?? '?';
                const depthHint = d === 0 ? '마지막 메시지 뒤' : d === 1 ? '마지막 메시지 앞' : `마지막에서 ${d}칸 위`;
                html += `<span class="sim-prompt-depth" title="${depthHint}">Depth ${d} · Order ${o}</span>`;
            }
            html += `<span class="sim-prompt-role">${escapeHtml(role)}</span>`;
            html += `</div>`;

            if (isEnabled && hasContent) {
                html += `<div class="sim-prompt-preview"><code>${escapeHtml(preview)}</code></div>`;
                if (resolved.length > 120) {
                    html += `<div class="sim-prompt-full-wrap">`;
                    html += `<button class="sim-expand-btn">전체 내용 보기 ▾</button>`;
                    html += `<pre class="sim-prompt-full">${escapeHtml(resolved)}</pre>`;
                    html += `</div>`;
                }
            } else if (isEnabled && !hasContent) {
                html += `<div class="sim-prompt-preview"><span class="sim-no-content">변수 설정만 수행 (출력 없음)</span></div>`;
            }

            html += `</div>`;
        });
        html += '</div>';

        // ─── 뷰 2: 최종 결과 ───
        html += `<div class="sim-view${activeViewTab === 'final' ? ' active' : ''}" id="sim-view-final">`;
        html += '<div class="sim-guide">실제 API에 전송되는 순서입니다. Depth는 마지막 메시지 기준 위치를 뜻합니다. (0 = 마지막 메시지 바로 뒤, 1 = 바로 앞, 숫자가 클수록 대화 위쪽)</div>';

        // 일반 프롬프트와 depth 프롬프트 분리
        let normalParts = [];
        let depthParts = [];
        prompts.forEach(p => {
            if (!p.enabled || !p.isLinked) return;
            const content = p.content || '';
            let resolved = stripSetMacros(content);
            resolved = resolveVariables(resolved, vars);
            resolved = resolved.replace(/\n{3,}/g, '\n\n').trim();
            if (!resolved) return;
            const name = p.name || p.identifier || '';
            const role = p.role || 'system';
            if (p.injection_position === 1) {
                depthParts.push({ name, role, content: resolved, depth: p.injection_depth ?? 0, order: p.injection_order ?? 0 });
            } else {
                normalParts.push({ name, role, content: resolved });
            }
        });

        // Depth: 높은 depth가 대화 앞쪽, 낮은 depth가 끝쪽. 같은 depth 내 order 오름차순.
        depthParts.sort((a, b) => {
            if (a.depth !== b.depth) return b.depth - a.depth;
            return a.order - b.order;
        });

        // depth별로 그룹핑
        const depthGroups = new Map();
        depthParts.forEach(p => {
            if (!depthGroups.has(p.depth)) depthGroups.set(p.depth, []);
            depthGroups.get(p.depth).push(p);
        });
        const depthKeys = [...depthGroups.keys()].sort((a, b) => b - a); // 높은 depth 먼저

        if (normalParts.length > 0 || depthParts.length > 0) {
            // 시스템 프롬프트
            normalParts.forEach(part => {
                html += `<div class="sim-final-block">`;
                html += `<div class="sim-final-header">`;
                html += `<span class="sim-prompt-name">${escapeHtml(part.name)}</span>`;
                html += `<span class="sim-prompt-role">${escapeHtml(part.role)}</span>`;
                html += `</div>`;
                html += `<pre class="sim-final-content">${escapeHtml(part.content)}</pre>`;
                html += `</div>`;
            });

            // 대화 내용 마커 → depth 프롬프트 → 마지막 메시지 마커 (분리 없이 하나의 흐름)
            if (depthParts.length > 0) {
                html += '<div class="sim-chat-placeholder">💬 대화 내용</div>';

                depthKeys.forEach(depth => {
                    if (depth === 0) {
                        html += '<div class="sim-chat-placeholder last">💬 마지막 메시지</div>';
                    }
                    const depthDesc = depth === 0
                        ? '마지막 메시지 바로 뒤'
                        : depth === 1
                            ? '마지막 메시지 바로 앞'
                            : `마지막 메시지에서 ${depth}칸 위`;
                    html += `<div class="sim-depth-marker">↕ Depth ${depth} — ${depthDesc}</div>`;
                    depthGroups.get(depth).forEach(part => {
                        html += `<div class="sim-final-block depth">`;
                        html += `<div class="sim-final-header">`;
                        html += `<span class="sim-prompt-name">${escapeHtml(part.name)}</span>`;
                        const dHint = part.depth === 0 ? '마지막 메시지 뒤' : part.depth === 1 ? '마지막 메시지 앞' : `마지막에서 ${part.depth}칸 위`;
                        html += `<span class="sim-final-depth" title="${dHint}">Depth ${part.depth} · Order ${part.order}</span>`;
                        html += `<span class="sim-prompt-role">${escapeHtml(part.role)}</span>`;
                        html += `</div>`;
                        html += `<pre class="sim-final-content">${escapeHtml(part.content)}</pre>`;
                        html += `</div>`;
                    });
                });

                if (!depthGroups.has(0)) {
                    html += '<div class="sim-chat-placeholder last">💬 마지막 메시지</div>';
                }
            }
        } else {
            html += '<div class="sim-empty">출력되는 내용이 없습니다.</div>';
        }
        html += '</div>';

        // ─── 뷰 3: 변수 목록 ───
        if (vars.size > 0) {
            html += `<div class="sim-view${activeViewTab === 'vars' ? ' active' : ''}" id="sim-view-vars">`;
            html += '<div class="sim-guide">프리셋 실행 후 최종 변수 상태입니다.</div>';

            const sorted = [...vars.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            sorted.forEach(([name, value]) => {
                const displayName = name.startsWith('global::') ? name.replace('global::', '') + ' (전역)' : name;
                const preview = value.length > 80 ? value.substring(0, 80) + '...' : value;
                const isEmpty = !value || value.trim() === '';

                html += '<div class="sim-var-row">';
                html += `<div class="sim-var-name"><code>${escapeHtml(displayName)}</code></div>`;
                if (isEmpty) {
                    html += `<div class="sim-var-value empty">(빈 값 — 초기화만 됨)</div>`;
                } else {
                    html += `<div class="sim-var-value"><code>${escapeHtml(preview)}</code></div>`;
                    if (value.length > 80) {
                        html += `<div class="sim-var-full-wrap">`;
                        html += `<button class="sim-expand-btn">전체 보기 ▾</button>`;
                        html += `<pre class="sim-var-full">${escapeHtml(value)}</pre>`;
                        html += `</div>`;
                    }
                }
                html += '</div>';
            });
            html += '</div>';
        }

        simResults.innerHTML = html;

        // 이벤트 바인딩
        // 뷰 전환
        simResults.querySelectorAll('.sim-view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                simResults.querySelectorAll('.sim-view-tab').forEach(t => t.classList.remove('active'));
                simResults.querySelectorAll('.sim-view').forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                activeViewTab = tab.dataset.view;
                document.getElementById('sim-view-' + tab.dataset.view).classList.add('active');
            });
        });

        // 토글 스위치
        simResults.querySelectorAll('[data-toggle-idx]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.toggleIdx);
                currentPrompts[idx].enabled = e.target.checked;
                runSimulation();
            });
        });

        // 전체 내용 펼치기
        simResults.querySelectorAll('.sim-expand-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const wrap = btn.parentElement;
                const full = wrap.querySelector('.sim-prompt-full, .sim-var-full');
                if (full) {
                    const isOpen = full.classList.toggle('open');
                    btn.textContent = isOpen ? '접기 ▴' : (full.classList.contains('sim-var-full') ? '전체 보기 ▾' : '전체 내용 보기 ▾');
                }
            });
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
