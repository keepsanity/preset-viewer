// ============================================
// Compare Tab Functionality
// ============================================

const compareState = {
    a: { fileName: '', data: null, prompts: [] },
    b: { fileName: '', data: null, prompts: [] }
};

// Upload handlers
document.querySelectorAll('.compare-upload-area').forEach(area => {
    area.addEventListener('click', () => {
        const side = area.dataset.compare;
        document.getElementById(`compareFile${side.toUpperCase()}`).click();
    });
});

document.getElementById('compareFileA').addEventListener('change', (e) => {
    handleCompareFile(e.target.files[0], 'a');
});

document.getElementById('compareFileB').addEventListener('change', (e) => {
    handleCompareFile(e.target.files[0], 'b');
});

function handleCompareFile(file, side) {
    if (!file || !file.name.endsWith('.json')) {
        alert('JSON 파일만 업로드 가능합니다.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.prompts || !data.prompt_order) {
                throw new Error('prompts 또는 prompt_order가 없습니다.');
            }

            compareState[side].fileName = file.name;
            compareState[side].data = data;
            compareState[side].prompts = buildPromptListWithLinkStatus(data);

            document.getElementById(`compareFilename${side.toUpperCase()}`).textContent = file.name;

            // Enable compare button if both files loaded
            document.getElementById('compareBtn').disabled =
                !(compareState.a.data && compareState.b.data);
        } catch (error) {
            alert('파일 처리 중 오류: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Compare button
document.getElementById('compareBtn').addEventListener('click', comparePresets);

function comparePresets() {
    const a = compareState.a;
    const b = compareState.b;
    if (!a.data || !b.data) return;

    // Build maps by identifier
    const mapA = new Map();
    const mapB = new Map();
    a.prompts.forEach(p => mapA.set(p.identifier, p));
    b.prompts.forEach(p => mapB.set(p.identifier, p));

    const onlyInA = [];
    const onlyInB = [];
    const changed = [];
    let identicalCount = 0;

    for (const [id, promptA] of mapA) {
        if (!mapB.has(id)) {
            onlyInA.push(promptA);
        } else {
            const promptB = mapB.get(id);
            const diffs = comparePromptFields(promptA, promptB);
            if (diffs.length > 0) {
                changed.push({ identifier: id, promptA, promptB, diffs });
            } else {
                identicalCount++;
            }
        }
    }

    for (const [id, promptB] of mapB) {
        if (!mapA.has(id)) {
            onlyInB.push(promptB);
        }
    }

    renderCompareResults({
        fileA: a.fileName,
        fileB: b.fileName,
        totalA: a.prompts.length,
        totalB: b.prompts.length,
        onlyInA,
        onlyInB,
        changed,
        identicalCount
    });
}

function comparePromptFields(a, b) {
    const diffs = [];

    if ((a.name || '') !== (b.name || ''))
        diffs.push({ field: '이름', a: a.name || '(없음)', b: b.name || '(없음)' });

    if ((a.role || '') !== (b.role || ''))
        diffs.push({ field: 'Role', a: a.role || '(없음)', b: b.role || '(없음)' });

    if ((a.content || '') !== (b.content || ''))
        diffs.push({ field: '내용', a: a.content || '', b: b.content || '', isContent: true });

    if (a.injection_depth !== b.injection_depth)
        diffs.push({ field: 'Depth', a: String(a.injection_depth ?? '없음'), b: String(b.injection_depth ?? '없음') });

    if (a.injection_order !== b.injection_order)
        diffs.push({ field: 'Order', a: String(a.injection_order ?? '없음'), b: String(b.injection_order ?? '없음') });

    if (a.injection_position !== b.injection_position)
        diffs.push({ field: 'Position', a: String(a.injection_position ?? '없음'), b: String(b.injection_position ?? '없음') });

    if (a.enabled !== b.enabled)
        diffs.push({ field: '활성화', a: a.enabled ? 'ON' : 'OFF', b: b.enabled ? 'ON' : 'OFF' });

    return diffs;
}

// ============================================
// LCS-based line diff
// ============================================

function computeLineDiff(textA, textB) {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const m = linesA.length, n = linesB.length;

    // For very long texts, skip diff
    if (m > 500 || n > 500) return null;

    // Build LCS table
    const dp = [];
    for (let i = 0; i <= m; i++) {
        dp[i] = new Uint16Array(n + 1);
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (linesA[i - 1] === linesB[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
            result.unshift({ type: 'same', text: linesA[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'added', text: linesB[j - 1] });
            j--;
        } else {
            result.unshift({ type: 'removed', text: linesA[i - 1] });
            i--;
        }
    }

    return result;
}

// ============================================
// Render compare results
// ============================================

function shortName(fileName) {
    return fileName.replace(/\.json$/i, '');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderCompareResults(data) {
    const container = document.getElementById('compareResults');

    // All identical
    if (data.onlyInA.length === 0 && data.onlyInB.length === 0 &&
        data.changed.length === 0) {
        container.innerHTML = '<div class="compare-identical">두 프리셋이 완전히 동일합니다!</div>';
        return;
    }

    let html = '';

    const nameA = shortName(data.fileA);
    const nameB = shortName(data.fileB);

    // Summary
    html += '<div class="compare-summary">';
    html += `<div class="compare-summary-row"><span class="compare-summary-label">${escapeHtml(nameA)}</span><span class="compare-summary-value">${data.totalA}개</span></div>`;
    html += `<div class="compare-summary-row"><span class="compare-summary-label">${escapeHtml(nameB)}</span><span class="compare-summary-value">${data.totalB}개</span></div>`;
    html += `<div class="compare-summary-row"><span class="compare-summary-label">동일 항목</span><span class="compare-summary-value">${data.identicalCount}개</span></div>`;
    html += `<div class="compare-summary-row"><span class="compare-summary-label">내용 다름</span><span class="compare-summary-value">${data.changed.length}개</span></div>`;
    if (data.onlyInA.length > 0) {
        html += `<div class="compare-summary-row"><span class="compare-summary-label">${escapeHtml(nameA)} 전용</span><span class="compare-summary-value">${data.onlyInA.length}개</span></div>`;
    }
    if (data.onlyInB.length > 0) {
        html += `<div class="compare-summary-row"><span class="compare-summary-label">${escapeHtml(nameB)} 전용</span><span class="compare-summary-value">${data.onlyInB.length}개</span></div>`;
    }
    html += '</div>';

    // Only in A
    if (data.onlyInA.length > 0) {
        html += '<div class="compare-section">';
        html += '<div class="compare-section-header only-a">';
        html += `<span>${escapeHtml(nameA)} 전용 프롬프트 (${data.onlyInA.length}개)</span>`;
        html += '<span class="compare-section-toggle">▼</span>';
        html += '</div>';
        html += '<div class="compare-section-body">';
        data.onlyInA.forEach(p => {
            html += renderUniqueItem(p, 'only-a');
        });
        html += '</div></div>';
    }

    // Only in B
    if (data.onlyInB.length > 0) {
        html += '<div class="compare-section">';
        html += '<div class="compare-section-header only-b">';
        html += `<span>${escapeHtml(nameB)} 전용 프롬프트 (${data.onlyInB.length}개)</span>`;
        html += '<span class="compare-section-toggle">▼</span>';
        html += '</div>';
        html += '<div class="compare-section-body">';
        data.onlyInB.forEach(p => {
            html += renderUniqueItem(p, 'only-b');
        });
        html += '</div></div>';
    }

    // Changed
    if (data.changed.length > 0) {
        html += '<div class="compare-section">';
        html += '<div class="compare-section-header changed">';
        html += `<span>내용이 다른 프롬프트 (${data.changed.length}개)</span>`;
        html += '<span class="compare-section-toggle">▼</span>';
        html += '</div>';
        html += '<div class="compare-section-body">';
        data.changed.forEach(item => {
            html += renderChangedItem(item, nameA, nameB);
        });
        html += '</div></div>';
    }

    container.innerHTML = html;

    // Section toggle event listeners
    container.querySelectorAll('.compare-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const toggle = header.querySelector('.compare-section-toggle');
            body.classList.toggle('active');
            if (toggle) toggle.classList.toggle('active');
        });
    });

    // Item toggle event listeners
    container.querySelectorAll('.compare-item-header').forEach(header => {
        header.addEventListener('click', () => {
            const detail = header.nextElementSibling;
            const toggle = header.querySelector('.compare-item-toggle');
            detail.classList.toggle('active');
            if (toggle) toggle.classList.toggle('active');
        });
    });
}

function renderUniqueItem(prompt, type) {
    let html = '<div class="compare-item">';
    html += `<div class="compare-item-header ${type}">`;
    html += `<span class="compare-item-name">${escapeHtml(prompt.name || 'Unnamed')}</span>`;
    html += '<div class="compare-item-badges">';
    if (prompt.role) html += `<span class="compare-badge role">${escapeHtml(prompt.role)}</span>`;
    if (prompt.enabled !== undefined) html += `<span class="compare-badge enabled">${prompt.enabled ? 'ON' : 'OFF'}</span>`;
    html += '</div>';
    html += '<span class="compare-item-toggle">▼</span>';
    html += '</div>';
    html += '<div class="compare-item-detail">';
    html += '<div class="compare-detail-inner">';

    // Meta info
    let meta = '';
    if (prompt.role) meta += `Role: ${escapeHtml(prompt.role)}`;
    if (prompt.injection_position === 1) {
        if (prompt.injection_depth !== undefined) meta += ` | Depth: ${prompt.injection_depth}`;
        if (prompt.injection_order !== undefined) meta += ` | Order: ${prompt.injection_order}`;
    }
    if (meta) html += `<div style="font-size:0.82em;color:#b05a8a;margin-bottom:8px">${meta}</div>`;

    html += `<div class="diff-content-box">${escapeHtml(prompt.content || '(내용 없음)')}</div>`;
    html += '</div></div></div>';
    return html;
}

function renderChangedItem(item, nameA, nameB) {
    const badgeMap = {
        '이름': 'name-diff',
        'Role': 'role',
        '내용': 'content',
        'Depth': 'depth',
        'Order': 'order-badge',
        'Position': 'position',
        '활성화': 'enabled'
    };

    let html = '<div class="compare-item">';
    html += '<div class="compare-item-header changed">';
    html += `<span class="compare-item-name">${escapeHtml(item.promptA.name || item.promptB.name || 'Unnamed')}</span>`;
    html += '<div class="compare-item-badges">';
    item.diffs.forEach(d => {
        const cls = badgeMap[d.field] || 'role';
        html += `<span class="compare-badge ${cls}">${escapeHtml(d.field)}</span>`;
    });
    html += '</div>';
    html += '<span class="compare-item-toggle">▼</span>';
    html += '</div>';
    html += '<div class="compare-item-detail">';
    html += '<div class="compare-detail-inner">';

    item.diffs.forEach(d => {
        html += '<div class="diff-field">';
        html += `<div class="diff-field-label">${escapeHtml(d.field)}</div>`;

        if (d.isContent) {
            // Content diff with LCS
            const diffResult = computeLineDiff(d.a, d.b);
            if (diffResult) {
                html += '<div class="diff-content-box">';
                diffResult.forEach(line => {
                    const prefix = line.type === 'removed' ? '- ' : line.type === 'added' ? '+ ' : '  ';
                    html += `<span class="diff-line ${line.type}">${escapeHtml(prefix + line.text)}</span>`;
                });
                html += '</div>';
            } else {
                // Too long for diff, show separately
                html += `<div class="diff-label-a">${escapeHtml(nameA)}:</div>`;
                html += `<div class="diff-content-box side-a">${escapeHtml(d.a || '(내용 없음)')}</div>`;
                html += `<div class="diff-label-b">${escapeHtml(nameB)}:</div>`;
                html += `<div class="diff-content-box side-b">${escapeHtml(d.b || '(내용 없음)')}</div>`;
            }
        } else {
            // Simple field diff: A → B
            html += '<div class="diff-field-values">';
            html += `<span class="diff-value a">${escapeHtml(d.a)}</span>`;
            html += '<span class="diff-arrow">→</span>';
            html += `<span class="diff-value b">${escapeHtml(d.b)}</span>`;
            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div></div></div>';
    return html;
}
