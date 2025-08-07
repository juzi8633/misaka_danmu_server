import { apiFetch } from '../api.js';

// DOM Elements
let sourcesSubNav, sourcesSubViews;
let danmakuSourcesList, saveDanmakuSourcesBtn, toggleDanmakuSourceBtn, moveDanmakuSourceUpBtn, moveDanmakuSourceDownBtn;
let metadataSourcesList, saveMetadataSourcesBtn, moveMetadataSourceUpBtn, moveMetadataSourceDownBtn;

function initializeElements() {
    sourcesSubNav = document.querySelector('#sources-view .settings-sub-nav');
    sourcesSubViews = document.querySelectorAll('#sources-view .settings-subview');

    danmakuSourcesList = document.getElementById('danmaku-sources-list');
    saveDanmakuSourcesBtn = document.getElementById('save-danmaku-sources-btn');
    toggleDanmakuSourceBtn = document.getElementById('toggle-danmaku-source-btn');
    moveDanmakuSourceUpBtn = document.getElementById('move-danmaku-source-up-btn');
    moveDanmakuSourceDownBtn = document.getElementById('move-danmaku-source-down-btn');

    metadataSourcesList = document.getElementById('metadata-sources-list');
    saveMetadataSourcesBtn = document.getElementById('save-metadata-sources-btn');
    moveMetadataSourceUpBtn = document.getElementById('move-metadata-source-up-btn');
    moveMetadataSourceDownBtn = document.getElementById('move-metadata-source-down-btn');
}

function handleSourcesSubNav(e) {
    const subNavBtn = e.target.closest('.sub-nav-btn');
    if (!subNavBtn) return;

    const subViewId = subNavBtn.getAttribute('data-subview');
    if (!subViewId) return;

    sourcesSubNav.querySelectorAll('.sub-nav-btn').forEach(btn => btn.classList.remove('active'));
    subNavBtn.classList.add('active');

    sourcesSubViews.forEach(view => view.classList.add('hidden'));
    const targetSubView = document.getElementById(subViewId);
    if (targetSubView) targetSubView.classList.remove('hidden');

    if (subViewId === 'danmaku-sources-subview') loadDanmakuSources();
    if (subViewId === 'metadata-sources-subview') loadMetadataSources();
}

async function loadDanmakuSources() {
    if (!danmakuSourcesList) return;
    danmakuSourcesList.innerHTML = '<li>加载中...</li>';
    try {
        const settings = await apiFetch('/api/ui/scrapers');
        renderDanmakuSources(settings);
    } catch (error) {
        danmakuSourcesList.innerHTML = `<li class="error">加载失败: ${(error.message || error)}</li>`;
    }
}

function renderDanmakuSources(settings) {
    danmakuSourcesList.innerHTML = '';
    settings.forEach(setting => {
        const li = document.createElement('li');
        li.dataset.providerName = setting.provider_name;
        li.dataset.isEnabled = setting.is_enabled;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'source-name';
        nameSpan.textContent = setting.provider_name;
        li.appendChild(nameSpan);

        // 新增：如果源是可配置的，则添加配置按钮
        if (setting.configurable_fields && Object.keys(setting.configurable_fields).length > 0) {
            const configBtn = document.createElement('button');
            configBtn.className = 'action-btn config-btn';
            configBtn.title = `配置 ${setting.provider_name}`;
            configBtn.textContent = '⚙️';
            configBtn.dataset.action = 'configure';
            configBtn.dataset.providerName = setting.provider_name;
            // 将字段信息存储为JSON字符串以便后续使用
            configBtn.dataset.fields = JSON.stringify(setting.configurable_fields);
            li.appendChild(configBtn);
        }

        const statusIcon = document.createElement('span');
        statusIcon.className = 'status-icon';
        statusIcon.textContent = setting.is_enabled ? '✅' : '❌';
        li.appendChild(statusIcon);

        li.addEventListener('click', (e) => {
            // 如果点击的是配置按钮，则不触发选中事件
            if (e.target.closest('.config-btn')) return;
            danmakuSourcesList.querySelectorAll('li').forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
        });
        danmakuSourcesList.appendChild(li);
    });
}

async function handleSaveDanmakuSources() {
    const settingsToSave = [];
    danmakuSourcesList.querySelectorAll('li').forEach((li, index) => {
        settingsToSave.push({
            provider_name: li.dataset.providerName,
            is_enabled: li.dataset.isEnabled === 'true',
            display_order: index + 1,
        });
    });
    try {
        saveDanmakuSourcesBtn.disabled = true;
        saveDanmakuSourcesBtn.textContent = '保存中...';
        await apiFetch('/api/ui/scrapers', {
            method: 'PUT',
            body: JSON.stringify(settingsToSave),
        });
        alert('搜索源设置已保存！');
        loadDanmakuSources();
    } catch (error) {
        alert(`保存失败: ${(error.message || error)}`);
    } finally {
        saveDanmakuSourcesBtn.disabled = false;
        saveDanmakuSourcesBtn.textContent = '保存设置';
    }
}

function handleToggleDanmakuSource() {
    const selected = danmakuSourcesList.querySelector('li.selected');
    if (!selected) return;
    const isEnabled = selected.dataset.isEnabled === 'true';
    selected.dataset.isEnabled = !isEnabled;
    selected.querySelector('.status-icon').textContent = !isEnabled ? '✅' : '❌';
}

function handleMoveDanmakuSource(direction) {
    const selected = danmakuSourcesList.querySelector('li.selected');
    if (!selected) return;
    if (direction === 'up' && selected.previousElementSibling) {
        danmakuSourcesList.insertBefore(selected, selected.previousElementSibling);
    } else if (direction === 'down' && selected.nextElementSibling) {
        danmakuSourcesList.insertBefore(selected.nextElementSibling, selected);
    }
}

async function loadMetadataSources() {
    if (!metadataSourcesList) return;
    metadataSourcesList.innerHTML = '<li>加载中...</li>';
    try {
        // This should be a new endpoint in the future, for now we hardcode it
        const sources = [
            { name: 'TMDB', status: '已配置' },
            { name: 'Bangumi', status: '已授权' }
        ];
        renderMetadataSources(sources);
    } catch (error) {
        metadataSourcesList.innerHTML = `<li class="error">加载失败: ${(error.message || error)}</li>`;
    }
}

function renderMetadataSources(sources) {
    metadataSourcesList.innerHTML = '';
    sources.forEach(source => {
        const li = document.createElement('li');
        li.dataset.sourceName = source.name;
        li.textContent = source.name;
        const statusIcon = document.createElement('span');
        statusIcon.className = 'status-icon';
        statusIcon.textContent = source.status;
        li.appendChild(statusIcon);
        li.addEventListener('click', () => {
            metadataSourcesList.querySelectorAll('li').forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
        });
        metadataSourcesList.appendChild(li);
    });
}

function handleMoveMetadataSource(direction) {
    const selected = metadataSourcesList.querySelector('li.selected');
    if (!selected) return;
    if (direction === 'up' && selected.previousElementSibling) {
        metadataSourcesList.insertBefore(selected, selected.previousElementSibling);
    } else if (direction === 'down' && selected.nextElementSibling) {
        metadataSourcesList.insertBefore(selected.nextElementSibling, selected);
    }
}

function handleSaveMetadataSources() {
    // In the future, this would save the order to the backend.
    alert('元信息搜索源的排序功能暂未实现后端保存。');
}

async function handleDanmakuSourceAction(e) {
    const button = e.target.closest('.config-btn');
    if (!button || button.dataset.action !== 'configure') return;

    const providerName = button.dataset.providerName;
    const fields = JSON.parse(button.dataset.fields);
    
    showScraperConfigModal(providerName, fields);
}

let currentProviderForModal = null;

function showScraperConfigModal(providerName, fields) {
    currentProviderForModal = providerName;
    const modal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `配置: ${providerName}`;
    modalBody.innerHTML = '<p>加载中...</p>';
    modal.classList.remove('hidden');

    apiFetch(`/api/ui/scrapers/${providerName}/config`)
        .then(currentConfig => {
            modalBody.innerHTML = ''; // 清空加载提示

            // 新增：为 gamer 源添加特别说明
            if (providerName === 'gamer') {
                const helpText = document.createElement('p');
                helpText.className = 'modal-help-text';
                helpText.innerHTML = `仅当无法正常搜索时才需要填写。请先尝试清空配置并保存，如果问题依旧，再从 <a href="https://ani.gamer.com.tw/" target="_blank" rel="noopener noreferrer">巴哈姆特动画疯</a> 获取最新的 User-Agent 和 Cookie。`;
                modalBody.appendChild(helpText);
            }

            Object.entries(fields).forEach(([key, label]) => {
                const value = currentConfig[key] || '';
                const formRow = document.createElement('div');
                formRow.className = 'form-row';
                
                const labelEl = document.createElement('label');
                labelEl.htmlFor = `config-input-${key}`;
                labelEl.textContent = label;
                
                const isCookie = key.toLowerCase().includes('cookie');
                const inputEl = document.createElement(isCookie ? 'textarea' : 'input');
                if (!isCookie) inputEl.type = 'text';
                inputEl.id = `config-input-${key}`;
                inputEl.name = key;
                inputEl.value = value;
                if (isCookie) inputEl.rows = 4;
                
                formRow.appendChild(labelEl);
                formRow.appendChild(inputEl);
                modalBody.appendChild(formRow);
            });
        })
        .catch(error => {
            modalBody.innerHTML = `<p class="error">加载配置失败: ${error.message}</p>`;
        });
}

function hideScraperConfigModal() {
    document.getElementById('generic-modal').classList.add('hidden');
    currentProviderForModal = null;
}

async function handleSaveScraperConfig() {
    if (!currentProviderForModal) return;
    const payload = {};
    document.getElementById('modal-body').querySelectorAll('input, textarea').forEach(input => {
        payload[input.name] = input.value.trim();
    });
    await apiFetch(`/api/ui/scrapers/${currentProviderForModal}/config`, { method: 'PUT', body: JSON.stringify(payload) });
    hideScraperConfigModal();
    alert('配置已保存！');
}

export function setupSourcesEventListeners() {
    initializeElements();
    sourcesSubNav.addEventListener('click', handleSourcesSubNav);

    danmakuSourcesList.addEventListener('click', handleDanmakuSourceAction);
    saveDanmakuSourcesBtn.addEventListener('click', handleSaveDanmakuSources);
    toggleDanmakuSourceBtn.addEventListener('click', handleToggleDanmakuSource);
    moveDanmakuSourceUpBtn.addEventListener('click', () => handleMoveDanmakuSource('up'));
    moveDanmakuSourceDownBtn.addEventListener('click', () => handleMoveDanmakuSource('down'));

    saveMetadataSourcesBtn.addEventListener('click', handleSaveMetadataSources);
    moveMetadataSourceUpBtn.addEventListener('click', () => handleMoveMetadataSource('up'));
    moveMetadataSourceDownBtn.addEventListener('click', () => handleMoveMetadataSource('down'));

    // Modal event listeners
    document.getElementById('modal-close-btn').addEventListener('click', hideScraperConfigModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', hideScraperConfigModal);
    document.getElementById('modal-save-btn').addEventListener('click', handleSaveScraperConfig);

    document.addEventListener('viewchange', (e) => {
        if (e.detail.viewId === 'sources-view') {
            const firstSubNavBtn = sourcesSubNav.querySelector('.sub-nav-btn');
            if (firstSubNavBtn) firstSubNavBtn.click();
        }
    });
}