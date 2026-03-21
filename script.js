const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const contentSection = document.getElementById('contentSection');
const promptList = document.getElementById('promptList');
const errorMessage = document.getElementById('errorMessage');
const stats = document.getElementById('stats');
const copyButton = document.getElementById('copyButton');
const presetName = document.getElementById('presetName');
const searchSection = document.getElementById('searchSection');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

let currentData = null;
let currentFileName = '';

// 업로드 영역 클릭 이벤트
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// 모바일 터치 이벤트
uploadArea.addEventListener('touchstart', (e) => {
    uploadArea.style.transform = 'scale(0.98)';
});

uploadArea.addEventListener('touchend', (e) => {
    uploadArea.style.transform = 'scale(1)';
});

// 드래그 앤 드롭 이벤트
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

// 파일 선택 이벤트
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// 파일 처리
function handleFile(file) {
    if (!file) return;

    if (!file.name.endsWith('.json')) {
        showError('JSON 파일만 업로드 가능합니다.');
        return;
    }

    // 파일명 저장
    currentFileName = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            processData(data);
        } catch (error) {
            showError('JSON 파일을 파싱하는 중 오류가 발생했습니다: ' + error.message);
        }
    };
    reader.onerror = () => {
        showError('파일을 읽는 중 오류가 발생했습니다.');
    };
    reader.readAsText(file);
}

// 데이터 처리
function processData(data) {
    try {
        if (!data.prompts || !data.prompt_order) {
            throw new Error('prompts 또는 prompt_order가 없습니다.');
        }

        const sortedPrompts = buildPromptListWithLinkStatus(data);

        currentData = sortedPrompts;
        displayPrompts(sortedPrompts);

        // 파일명 표시
        presetName.textContent = `📄 ${currentFileName}`;
        presetName.style.display = 'block';

        hideError();
        searchSection.classList.add('active');
        contentSection.classList.add('active');
    } catch (error) {
        showError('데이터 처리 중 오류가 발생했습니다: ' + error.message);
    }
}

// prompt_order 연결 상태를 포함한 프롬프트 목록 생성
function buildPromptListWithLinkStatus(data) {
    const targetOrder = data.prompt_order.find(po => po.character_id === 100001);
    const promptsMap = new Map();
    const linkedIdentifiers = new Set();
    const sortedPrompts = [];

    data.prompts.forEach(prompt => {
        if (prompt?.identifier) {
            promptsMap.set(prompt.identifier, prompt);
        }
    });

    // 1) 연결된 프롬프트를 order 순서대로 먼저 배치
    if (targetOrder?.order?.length) {
        targetOrder.order.forEach(orderItem => {
            const prompt = promptsMap.get(orderItem.identifier);
            if (prompt) {
                sortedPrompts.push({
                    ...prompt,
                    enabled: orderItem.enabled,
                    isLinked: true
                });
                linkedIdentifiers.add(prompt.identifier);
            }
        });
    }

    // 2) order에 없는 프롬프트(미연결) 추가
    data.prompts.forEach(prompt => {
        if (!prompt?.identifier) return;
        if (!linkedIdentifiers.has(prompt.identifier)) {
            sortedPrompts.push({
                ...prompt,
                enabled: false,
                isLinked: false
            });
        }
    });

    return sortedPrompts;
}

// 프롬프트 표시
function displayPrompts(prompts) {
    promptList.innerHTML = '';

    let enabledCount = 0;
    let disabledCount = 0;
    let unlinkedCount = 0;

    prompts.forEach((prompt, index) => {
        if (prompt.enabled) enabledCount++;
        else disabledCount++;
        if (prompt.isLinked === false) unlinkedCount++;

        const promptItem = document.createElement('div');
        promptItem.className = 'prompt-item';
        if (prompt.isLinked === false) {
            promptItem.classList.add('unlinked');
        }

        const header = document.createElement('div');
        header.className = 'prompt-header';
        header.style.opacity = prompt.enabled ? '1' : '0.6';
        promptItem.dataset.index = index;

        // 상단 행 (이름, role, 버튼들)
        const headerTop = document.createElement('div');
        headerTop.className = 'prompt-header-top';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'prompt-header-left';

        const name = document.createElement('span');
        name.className = 'prompt-name';
        name.textContent = prompt.name || 'Unnamed';

        headerLeft.appendChild(name);

        const headerRight = document.createElement('div');
        headerRight.className = 'prompt-header-right';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'prompt-copy-btn';
        copyBtn.textContent = '📋 복사';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            copyPromptContent(prompt, copyBtn);
        };

        const toggle = document.createElement('span');
        toggle.className = 'prompt-toggle';
        toggle.textContent = '▼';

        headerRight.appendChild(copyBtn);
        headerRight.appendChild(toggle);

        headerTop.appendChild(headerLeft);
        headerTop.appendChild(headerRight);

        // 메타 정보 행
        const headerMeta = document.createElement('div');
        headerMeta.className = 'prompt-header-meta';

        // Role
        if (prompt.role) {
            const roleItem = document.createElement('div');
            roleItem.className = 'prompt-header-meta-item';
            roleItem.innerHTML = `<span class="prompt-header-meta-label">Role:</span> ${prompt.role}`;
            headerMeta.appendChild(roleItem);
        }

        // Injection Depth (injection_position이 1인 경우만)
        if (prompt.injection_position === 1 && prompt.injection_depth !== undefined) {
            const depthItem = document.createElement('div');
            depthItem.className = 'prompt-header-meta-item';
            depthItem.innerHTML = `<span class="prompt-header-meta-label">Depth:</span> ${prompt.injection_depth}`;
            headerMeta.appendChild(depthItem);
        }

        // Injection Order (injection_position이 1인 경우만)
        if (prompt.injection_position === 1 && prompt.injection_order !== undefined) {
            const orderItem = document.createElement('div');
            orderItem.className = 'prompt-header-meta-item';
            orderItem.innerHTML = `<span class="prompt-header-meta-label">Order:</span> ${prompt.injection_order}`;
            headerMeta.appendChild(orderItem);
        }

        // 연결 상태
        const linkItem = document.createElement('div');
        linkItem.className = 'prompt-header-meta-item';
        if (prompt.isLinked === false) {
            linkItem.classList.add('unlinked');
        }
        linkItem.innerHTML = `<span class="prompt-header-meta-label">연결:</span> ${prompt.isLinked === false ? '미연결' : '연결됨'}`;
        headerMeta.appendChild(linkItem);

        header.appendChild(headerTop);
        header.appendChild(headerMeta);

        const content = document.createElement('div');
        content.className = 'prompt-content';

        const contentInner = document.createElement('div');
        contentInner.className = 'prompt-content-inner';
        contentInner.textContent = prompt.content || '(내용 없음)';

        content.appendChild(contentInner);

        headerLeft.addEventListener('click', () => {
            const isActive = content.classList.contains('active');
            content.classList.toggle('active');
            toggle.classList.toggle('active');
        });

        toggle.addEventListener('click', () => {
            const isActive = content.classList.contains('active');
            content.classList.toggle('active');
            toggle.classList.toggle('active');
        });

        promptItem.appendChild(header);
        promptItem.appendChild(content);
        promptList.appendChild(promptItem);
    });

    // 통계 표시
    stats.innerHTML = `
        <div class="stat-item">
            <div class="stat-number">${prompts.length}</div>
            <div class="stat-label">전체 프롬프트</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${enabledCount}</div>
            <div class="stat-label">활성화됨</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${disabledCount}</div>
            <div class="stat-label">비활성화됨</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${unlinkedCount}</div>
            <div class="stat-label">미연결</div>
        </div>
    `;
}

// 전체 텍스트 복사
copyButton.addEventListener('click', async () => {
    if (!currentData) return;

    let text = '';

    currentData.forEach((prompt, index) => {
        // 프롬프트 이름
        text += `[${prompt.name || 'Unnamed'}]`;

        // Role 추가
        if (prompt.role) {
            text += ` (${prompt.role})`;
        }

        // 활성화 상태
        text += prompt.enabled ? ' [활성화]\n' : ' [비활성화]\n';

        // 구분선
        text += '─'.repeat(50) + '\n';

        // 내용
        text += (prompt.content || '(내용 없음)') + '\n';

        // 프롬프트 사이 구분
        if (index < currentData.length - 1) {
            text += '\n' + '═'.repeat(50) + '\n\n';
        }
    });

    // 클립보드에 복사
    try {
        // textarea를 이용한 복사 (모바일 호환)
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);

        // iOS Safari 지원
        if (navigator.userAgent.match(/ipad|iphone/i)) {
            const range = document.createRange();
            range.selectNodeContents(textarea);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textarea.setSelectionRange(0, 999999);
        } else {
            textarea.select();
        }

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
            // 버튼 텍스트 변경 및 스타일 변경
            const originalText = copyButton.textContent;
            copyButton.textContent = '✓ 복사 완료!';
            copyButton.classList.add('copied');

            // 2초 후 원래대로
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.classList.remove('copied');
            }, 2000);
        } else {
            throw new Error('복사 실패');
        }
    } catch (err) {
        // 복사 실패 시 폴백
        showError('클립보드 복사에 실패했습니다.');
        console.error('복사 실패:', err);
    }
});

// 개별 프롬프트 복사
function copyPromptContent(prompt, button) {
    const text = prompt.content || '(내용 없음)';

    try {
        // textarea를 이용한 복사 (모바일 호환)
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);

        // iOS Safari 지원
        if (navigator.userAgent.match(/ipad|iphone/i)) {
            const range = document.createRange();
            range.selectNodeContents(textarea);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textarea.setSelectionRange(0, 999999);
        } else {
            textarea.select();
        }

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
            const originalText = button.textContent;
            button.textContent = '✓';
            button.classList.add('copied');

            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 1500);
        } else {
            throw new Error('복사 실패');
        }
    } catch (err) {
        showError('클립보드 복사에 실패했습니다.');
        console.error('복사 실패:', err);
    }
}

// 검색 기능
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        searchResults.classList.remove('active');
        searchResults.innerHTML = '';
        return;
    }

    const results = currentData.filter(prompt => {
        const name = (prompt.name || '').toLowerCase();
        const content = (prompt.content || '').toLowerCase();
        const role = (prompt.role || '').toLowerCase();

        return name.includes(query) || content.includes(query) || role.includes(query);
    });

    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item" style="text-align: center; color: #999;">검색 결과가 없습니다</div>';
        searchResults.classList.add('active');
        return;
    }

    searchResults.innerHTML = '';
    results.forEach((prompt, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';

        const resultName = document.createElement('div');
        resultName.className = 'search-result-name';
        resultName.textContent = prompt.name || 'Unnamed';

        const resultContent = document.createElement('div');
        resultContent.className = 'search-result-content';
        const contentPreview = (prompt.content || '').substring(0, 100);
        resultContent.textContent = contentPreview + (contentPreview.length === 100 ? '...' : '');

        resultItem.appendChild(resultName);
        resultItem.appendChild(resultContent);

        resultItem.addEventListener('click', () => {
            scrollToPrompt(prompt);
            searchResults.classList.remove('active');
            searchInput.value = '';
        });

        searchResults.appendChild(resultItem);
    });

    searchResults.classList.add('active');
});

// 프롬프트로 스크롤
function scrollToPrompt(prompt) {
    const items = document.querySelectorAll('.prompt-item');
    items.forEach((item, index) => {
        if (currentData[index] === prompt) {
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 하이라이트 효과
            item.style.transition = 'all 0.3s ease';
            item.style.backgroundColor = '#fff0f8';
            item.style.transform = 'scale(1.02)';

            setTimeout(() => {
                item.style.backgroundColor = '';
                item.style.transform = '';
            }, 1500);

            // 자동으로 펼치기
            const content = item.querySelector('.prompt-content');
            const toggle = item.querySelector('.prompt-toggle');
            if (!content.classList.contains('active')) {
                content.classList.add('active');
                toggle.classList.add('active');
            }
        }
    });
}

// 에러 표시
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
}

// 에러 숨기기
function hideError() {
    errorMessage.classList.remove('active');
}

// ============================================
// Transfer Tab Functionality
// ============================================

// Page navigation
const allPages = document.querySelectorAll('.page');

function showPage(pageId) {
    allPages.forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
}

// Menu card clicks
document.querySelectorAll('.menu-card').forEach(card => {
    card.addEventListener('click', () => {
        showPage(card.dataset.page);
    });
});

// Back buttons
document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
        showPage('menu');
    });
});

// Transfer tab state
const transferState = {
    left: {
        fileName: '',
        originalData: null,
        prompts: []
    },
    right: {
        fileName: '',
        originalData: null,
        prompts: []
    }
};

// Upload area click handlers
document.querySelectorAll('.column-upload-area').forEach(area => {
    area.addEventListener('click', () => {
        const column = area.dataset.column;
        document.getElementById(`${column}FileInput`).click();
    });
});

// File input handlers
document.getElementById('leftFileInput').addEventListener('change', (e) => {
    handleTransferFile(e.target.files[0], 'left');
});

document.getElementById('rightFileInput').addEventListener('change', (e) => {
    handleTransferFile(e.target.files[0], 'right');
});

// Handle file upload for transfer
function handleTransferFile(file, column) {
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

            const sortedPrompts = buildPromptListWithLinkStatus(data);

            // Store data
            transferState[column].fileName = file.name;
            transferState[column].originalData = data;
            transferState[column].prompts = sortedPrompts;

            // Update UI
            document.getElementById(`${column}Filename`).textContent = file.name;
            renderTransferPrompts(column);
            document.getElementById(`${column}ExportBtn`).style.display = 'block';

        } catch (error) {
            alert('파일 처리 중 오류: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Render prompts in transfer column
function renderTransferPrompts(column) {
    const listElement = document.getElementById(`${column}PromptList`);
    const prompts = transferState[column].prompts;

    if (prompts.length === 0) {
        listElement.innerHTML = '<div class="empty-state">프롬프트가 없습니다</div>';
        return;
    }

    listElement.innerHTML = '';
    const firstUnlinkedIndex = prompts.findIndex(prompt => prompt.isLinked === false);
    prompts.forEach((prompt, index) => {
        if (index === firstUnlinkedIndex && firstUnlinkedIndex > 0) {
            const separator = document.createElement('div');
            separator.className = 'transfer-separator';
            separator.textContent = '여기부터 미연결 프롬프트';
            listElement.appendChild(separator);
        }

        const item = document.createElement('div');
        item.className = 'prompt-item-transfer';
        if (prompt.isLinked === false) {
            item.classList.add('unlinked');
        }
        item.textContent = prompt.name || 'Unnamed';
        item.draggable = true;
        item.dataset.column = column;
        item.dataset.index = index;

        // Click to view in modal
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('dragging')) {
                showPromptModal(prompt);
            }
        });

        // Drag events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);

        // Touch events for mobile
        item.addEventListener('touchstart', handleTouchStart, { passive: false });
        item.addEventListener('touchmove', handleTouchMove, { passive: false });
        item.addEventListener('touchend', handleTouchEnd);

        listElement.appendChild(item);
    });

    // Setup drag events for all items after rendering
    setupItemDragEvents();
}

// Drag and drop handlers
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = {
        column: e.target.dataset.column,
        index: parseInt(e.target.dataset.index),
        prompt: transferState[e.target.dataset.column].prompts[e.target.dataset.index],
        element: e.target
    };
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    // Remove all drop indicators
    document.querySelectorAll('.drop-above, .drop-below').forEach(el => {
        el.classList.remove('drop-above', 'drop-below');
    });
}

// Touch drag and drop for mobile
let touchDragState = {
    isDragging: false,
    draggedElement: null,
    clone: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    sourceColumn: null,
    sourceIndex: null,
    touchStartTime: 0
};

function handleTouchStart(e) {
    const touch = e.touches[0];
    const item = e.currentTarget;

    touchDragState.touchStartTime = Date.now();
    touchDragState.startX = touch.clientX;
    touchDragState.startY = touch.clientY;
    touchDragState.draggedElement = item;
    touchDragState.sourceColumn = item.dataset.column;
    touchDragState.sourceIndex = parseInt(item.dataset.index);

    // Start drag after a short delay to distinguish from click
    setTimeout(() => {
        if (touchDragState.draggedElement === item && !touchDragState.isDragging) {
            const touchDuration = Date.now() - touchDragState.touchStartTime;
            if (touchDuration >= 100) {
                startTouchDrag(item);
            }
        }
    }, 100);
}

function startTouchDrag(item) {
    touchDragState.isDragging = true;

    // Create visual clone
    const clone = item.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.zIndex = '10000';
    clone.style.opacity = '0.7';
    clone.style.pointerEvents = 'none';
    clone.style.width = item.offsetWidth + 'px';
    clone.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    document.body.appendChild(clone);
    touchDragState.clone = clone;

    // Add dragging class to original
    item.classList.add('dragging');

    // Store dragged item info
    draggedItem = {
        column: touchDragState.sourceColumn,
        index: touchDragState.sourceIndex,
        prompt: transferState[touchDragState.sourceColumn].prompts[touchDragState.sourceIndex],
        element: item
    };
}

function handleTouchMove(e) {
    if (!touchDragState.isDragging) {
        // Check if we should start dragging
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchDragState.startX);
        const deltaY = Math.abs(touch.clientY - touchDragState.startY);

        if (deltaX > 10 || deltaY > 10) {
            const touchDuration = Date.now() - touchDragState.touchStartTime;
            if (touchDuration >= 100 && touchDragState.draggedElement) {
                startTouchDrag(touchDragState.draggedElement);
            }
        }
        return;
    }

    e.preventDefault();
    const touch = e.touches[0];
    touchDragState.currentX = touch.clientX;
    touchDragState.currentY = touch.clientY;

    // Update clone position
    if (touchDragState.clone) {
        touchDragState.clone.style.left = (touch.clientX - touchDragState.clone.offsetWidth / 2) + 'px';
        touchDragState.clone.style.top = (touch.clientY - touchDragState.clone.offsetHeight / 2) + 'px';
    }

    // Find element under touch
    const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);

    // Remove previous indicators
    document.querySelectorAll('.drop-above, .drop-below').forEach(el => {
        el.classList.remove('drop-above', 'drop-below');
    });

    if (elementUnderTouch) {
        const targetItem = elementUnderTouch.closest('.prompt-item-transfer');
        if (targetItem && targetItem !== touchDragState.draggedElement && !targetItem.classList.contains('dragging')) {
            const position = getDropPosition(targetItem, touch.clientY);
            if (position === 'above') {
                targetItem.classList.add('drop-above');
            } else {
                targetItem.classList.add('drop-below');
            }
        }
    }
}

function handleTouchEnd(e) {
    if (!touchDragState.isDragging) {
        // It was a tap, not a drag - trigger click for modal
        if (Date.now() - touchDragState.touchStartTime < 300) {
            const item = touchDragState.draggedElement;
            if (item) {
                const column = item.dataset.column;
                const index = parseInt(item.dataset.index);
                const prompt = transferState[column].prompts[index];
                showPromptModal(prompt);
            }
        }
        resetTouchDragState();
        return;
    }

    e.preventDefault();

    const touch = e.changedTouches[0];
    const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);

    if (elementUnderTouch) {
        const targetItem = elementUnderTouch.closest('.prompt-item-transfer');
        const targetList = elementUnderTouch.closest('.prompt-list-transfer');

        if (targetItem && targetItem !== touchDragState.draggedElement) {
            // Drop on specific item
            const targetColumn = targetItem.dataset.column;
            const targetIndex = parseInt(targetItem.dataset.index);
            const position = getDropPosition(targetItem, touch.clientY);

            let insertIndex = targetIndex;
            if (position === 'below') {
                insertIndex = targetIndex + 1;
            }

            if (targetColumn === touchDragState.sourceColumn) {
                // Same column reordering (move)
                const prompts = transferState[touchDragState.sourceColumn].prompts;
                const [movedPrompt] = prompts.splice(touchDragState.sourceIndex, 1);

                if (touchDragState.sourceIndex < insertIndex) {
                    insertIndex--;
                }

                prompts.splice(insertIndex, 0, movedPrompt);
                renderTransferPrompts(touchDragState.sourceColumn);
            } else {
                // Cross-column transfer (copy, not move)
                const copiedPrompt = { ...transferState[touchDragState.sourceColumn].prompts[touchDragState.sourceIndex] };
                transferState[targetColumn].prompts.splice(insertIndex, 0, copiedPrompt);

                renderTransferPrompts(targetColumn);
            }
        } else if (targetList && targetList.dataset.column !== touchDragState.sourceColumn) {
            // Drop on empty area of different column (copy)
            const targetColumn = targetList.dataset.column;
            const copiedPrompt = { ...transferState[touchDragState.sourceColumn].prompts[touchDragState.sourceIndex] };
            transferState[targetColumn].prompts.push(copiedPrompt);

            renderTransferPrompts(targetColumn);
        }
    }

    resetTouchDragState();
}

function resetTouchDragState() {
    // Remove clone
    if (touchDragState.clone) {
        touchDragState.clone.remove();
    }

    // Remove dragging class
    if (touchDragState.draggedElement) {
        touchDragState.draggedElement.classList.remove('dragging');
    }

    // Remove indicators
    document.querySelectorAll('.drop-above, .drop-below').forEach(el => {
        el.classList.remove('drop-above', 'drop-below');
    });

    // Reset state
    touchDragState = {
        isDragging: false,
        draggedElement: null,
        clone: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        sourceColumn: null,
        sourceIndex: null,
        touchStartTime: 0
    };

    draggedItem = null;
}

// Helper function to get drop position
function getDropPosition(item, clientY) {
    const rect = item.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    return clientY < midpoint ? 'above' : 'below';
}

// Setup drop zones on individual items
function setupItemDragEvents() {
    document.querySelectorAll('.prompt-item-transfer').forEach(item => {
        item.addEventListener('dragover', (e) => {
            e.preventDefault();

            if (!draggedItem || item === draggedItem.element) return;

            // Remove previous indicators
            document.querySelectorAll('.drop-above, .drop-below').forEach(el => {
                el.classList.remove('drop-above', 'drop-below');
            });

            // Add indicator based on position
            const position = getDropPosition(item, e.clientY);
            if (position === 'above') {
                item.classList.add('drop-above');
            } else {
                item.classList.add('drop-below');
            }
        });

        item.addEventListener('dragleave', (e) => {
            // Only remove if we're actually leaving the item
            if (!e.currentTarget.contains(e.relatedTarget)) {
                item.classList.remove('drop-above', 'drop-below');
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!draggedItem) return;

            const targetColumn = item.dataset.column;
            const sourceColumn = draggedItem.column;
            const targetIndex = parseInt(item.dataset.index);
            const position = getDropPosition(item, e.clientY);

            // Calculate insert position
            let insertIndex = targetIndex;
            if (position === 'below') {
                insertIndex = targetIndex + 1;
            }

            // Handle same column reordering (move)
            if (targetColumn === sourceColumn) {
                const prompts = transferState[sourceColumn].prompts;
                const [movedPrompt] = prompts.splice(draggedItem.index, 1);

                // Adjust insert index if moving down in same column
                if (draggedItem.index < insertIndex) {
                    insertIndex--;
                }

                prompts.splice(insertIndex, 0, movedPrompt);
                renderTransferPrompts(sourceColumn);
            } else {
                // Cross-column transfer (copy, not move)
                const copiedPrompt = { ...transferState[sourceColumn].prompts[draggedItem.index] };
                transferState[targetColumn].prompts.splice(insertIndex, 0, copiedPrompt);

                renderTransferPrompts(targetColumn);
            }

            // Clean up
            item.classList.remove('drop-above', 'drop-below');
            draggedItem = null;
        });
    });
}

// Setup drop zones on lists (for empty areas)
document.querySelectorAll('.prompt-list-transfer').forEach(list => {
    list.addEventListener('dragover', (e) => {
        e.preventDefault();

        // Only show list-level drag-over if not over an item
        if (!e.target.classList.contains('prompt-item-transfer')) {
            list.classList.add('drag-over');
        }
    });

    list.addEventListener('dragleave', (e) => {
        if (!list.contains(e.relatedTarget)) {
            list.classList.remove('drag-over');
        }
    });

    list.addEventListener('drop', (e) => {
        // Only handle if dropping on empty space
        if (e.target.classList.contains('prompt-list-transfer') ||
            e.target.classList.contains('empty-state')) {
            e.preventDefault();
            list.classList.remove('drag-over');

            if (!draggedItem) return;

            const targetColumn = list.dataset.column;
            const sourceColumn = draggedItem.column;

            if (targetColumn === sourceColumn) return;

            // Copy to end of target (not move)
            const copiedPrompt = { ...transferState[sourceColumn].prompts[draggedItem.index] };
            transferState[targetColumn].prompts.push(copiedPrompt);

            // Re-render target column only
            renderTransferPrompts(targetColumn);

            draggedItem = null;
        }

    });
});

// Modal functionality
const modal = document.getElementById('promptModal');
const modalClose = document.getElementById('modalClose');

function showPromptModal(prompt) {
    document.getElementById('modalPromptName').textContent = prompt.name || 'Unnamed';
    document.getElementById('modalPromptContent').textContent = prompt.content || '(내용 없음)';

    // Build meta info
    let metaHTML = '';
    if (prompt.role) {
        metaHTML += `<div class="modal-meta-item"><span class="modal-meta-label">Role:</span> ${prompt.role}</div>`;
    }
    if (prompt.injection_position === 1 && prompt.injection_depth !== undefined) {
        metaHTML += `<div class="modal-meta-item"><span class="modal-meta-label">Depth:</span> ${prompt.injection_depth}</div>`;
    }
    if (prompt.injection_position === 1 && prompt.injection_order !== undefined) {
        metaHTML += `<div class="modal-meta-item"><span class="modal-meta-label">Order:</span> ${prompt.injection_order}</div>`;
    }
    if (prompt.enabled !== undefined) {
        metaHTML += `<div class="modal-meta-item"><span class="modal-meta-label">상태:</span> ${prompt.enabled ? '활성화' : '비활성화'}</div>`;
    }

    document.getElementById('modalMeta').innerHTML = metaHTML;

    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
}

modalClose.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeModal();
    }
});

// Export functionality
document.getElementById('leftExportBtn').addEventListener('click', () => {
    exportPreset('left');
});

document.getElementById('rightExportBtn').addEventListener('click', () => {
    exportPreset('right');
});

function exportPreset(column) {
    const state = transferState[column];

    if (!state.originalData || !state.fileName) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }

    // Clone original data
    const exportData = JSON.parse(JSON.stringify(state.originalData));

    // Update prompts array (UI 전용 필드는 제거)
    exportData.prompts = state.prompts.map(({ isLinked, ...prompt }) => prompt);

    // Update prompt_order for character_id 100001
    const targetOrderIndex = exportData.prompt_order.findIndex(po => po.character_id === 100001);
    if (targetOrderIndex !== -1) {
        exportData.prompt_order[targetOrderIndex].order = state.prompts.map(p => ({
            identifier: p.identifier,
            enabled: p.enabled !== undefined ? p.enabled : true
        }));
    }

    // Create filename with _custom_update suffix
    const originalName = state.fileName.replace('.json', '');
    const newFileName = `${originalName}_custom_update.json`;

    // Download
    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = newFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
