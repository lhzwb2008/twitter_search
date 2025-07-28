// AI产品搜索应用的前端逻辑
document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const searchForm = document.getElementById('search-form');
    const previewPromptBtn = document.getElementById('preview-prompt');
    const searchBtn = document.getElementById('search-btn');
    const taskStatus = document.getElementById('task-status');
    const statusText = document.querySelector('.status-text');
    const taskControls = document.getElementById('task-controls');
    const checkResultBtn = document.getElementById('check-result-btn');
    const refreshPreviewBtn = document.getElementById('refresh-preview-btn');
    const taskIdDisplay = document.getElementById('task-id-display');
    const livePreview = document.getElementById('live-preview');
    const previewIframe = document.getElementById('preview-iframe');
    const previewLink = document.querySelector('.preview-link');
    const progressFill = document.querySelector('.progress-fill');
    const resultsSection = document.getElementById('results');
    const productsGrid = document.getElementById('products-grid');
    const productCount = document.querySelector('.product-count');
    const searchNote = document.querySelector('.search-note');
    const loading = document.getElementById('loading');
    
    // 模态框元素
    const promptModal = document.getElementById('prompt-modal');
    const modalClose = document.querySelector('.modal-close');
    const generatedPrompt = document.getElementById('generated-prompt');
    
    // 分类管理元素
    const categoryModal = document.getElementById('category-modal');
    const categoryModalClose = document.querySelector('.category-modal-close');
    const manageCategoriesBtn = document.getElementById('manage-categories');
    const categoriesContainer = document.getElementById('categories-container');
    const selectAllBtn = document.getElementById('select-all-categories');
    const deselectAllBtn = document.getElementById('deselect-all-categories');
    const resetCategoriesBtn = document.getElementById('reset-categories');

    let currentTaskId = null;
    let statusCheckInterval = null;
    
    // 分类数据管理
    let categorySettings = {
        preset: [],
        custom: []
    };

    // 初始化
    initializeTagInputs();
    initializeCategoryManagement();

    // 事件监听器
    searchForm.addEventListener('submit', handleSearch);
    previewPromptBtn.addEventListener('click', showPromptPreview);
    checkResultBtn.addEventListener('click', manualCheckResult);
    refreshPreviewBtn.addEventListener('click', refreshPreview);
    modalClose.addEventListener('click', closeModal);
    promptModal.addEventListener('click', function(e) {
        if (e.target === promptModal) {
            closeModal();
        }
    });
    
    // 分类管理事件监听器
    manageCategoriesBtn.addEventListener('click', showCategoryModal);
    categoryModalClose.addEventListener('click', closeCategoryModal);
    categoryModal.addEventListener('click', function(e) {
        if (e.target === categoryModal) {
            closeCategoryModal();
        }
    });
    selectAllBtn.addEventListener('click', selectAllCategories);
    deselectAllBtn.addEventListener('click', deselectAllCategories);
    resetCategoriesBtn.addEventListener('click', resetToDefaultCategories);

    // 初始化标签输入功能
    function initializeTagInputs() {
        const tagInputs = [
            { input: 'keyword-input', container: 'keywords-tags' },
            { input: 'modifier-input', container: 'modifiers-tags' },
            { input: 'exclude-company-input', container: 'exclude-companies-tags' },
            { input: 'exclude-content-input', container: 'exclude-content-tags' }
        ];

        tagInputs.forEach(({ input, container }) => {
            const inputEl = document.getElementById(input);
            const containerEl = document.getElementById(container);

            // 输入框回车事件
            inputEl.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = inputEl.value.trim();
                    if (value) {
                        addTag(containerEl, value);
                        inputEl.value = '';
                    }
                }
            });

            // 删除标签事件委托
            containerEl.addEventListener('click', function(e) {
                if (e.target.classList.contains('tag-remove')) {
                    e.target.parentElement.remove();
                }
            });
        });
    }

    // 添加标签
    function addTag(container, value) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.setAttribute('data-value', value);
        tag.innerHTML = `${value} <button type="button" class="tag-remove">×</button>`;
        container.appendChild(tag);
    }

    // 获取标签值
    function getTagValues(containerId) {
        const tags = document.querySelectorAll(`#${containerId} .tag`);
        return Array.from(tags).map(tag => tag.getAttribute('data-value'));
    }

    // 生成搜索Prompt
    function generatePrompt() {
        const formData = new FormData(searchForm);
        const customPrompt = document.getElementById('custom-prompt').value.trim();
        
        // 如果有自定义Prompt，直接返回
        if (customPrompt) {
            return customPrompt;
        }

        // 获取表单数据
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const resultLimit = formData.get('resultLimit');
        const keywords = getTagValues('keywords-tags');
        const modifiers = getTagValues('modifiers-tags');
        const excludeCompanies = getTagValues('exclude-companies-tags');
        const excludeContent = getTagValues('exclude-content-tags');
        const categories = Array.from(document.querySelectorAll('input[name="categories"]:checked'))
            .map(cb => cb.value);

        // 构建灵活的Prompt
        const keywordStr = keywords.length > 0 ? keywords.join(' OR ') : 'AI app';
        const excludeStr = excludeCompanies.length > 0 ? excludeCompanies.map(c => `-from:${c}`).join(' ') : '-from:Google -from:Microsoft -from:OpenAI';
        
        let prompt = `You are an AI Product Discovery Expert. Find at least ${resultLimit} AI-related products from Twitter mirror sites.

IMPORTANT: You MUST return at least ${resultLimit} AI products in JSON format. Follow these flexible strategies:

1. Try multiple Nitter instances:
   - https://nitter.privacyredirect.com/
   - https://nitter.net/
   - https://nitter.poast.org/
   - https://nitter.1d4.us/

2. Search Flexibility:
   - Start with: ${startDate} to ${endDate}
   - If no results, expand date range
   - Try multiple queries:
     * "${keywordStr}" ${excludeStr}
     * "new AI" OR "AI launch" OR "AI startup"
     * "AI agent" OR "AI tool" OR "AI app"

3. Result Requirements:
   - MUST find at least ${resultLimit} AI products
   - Include ANY AI products if exact matches aren't found
   - Fill missing fields with empty strings

4. Output Format (MANDATORY JSON ONLY):
{
  "products": [
    {
      "name": "Product Name",
      "description": "Brief description",
      "url": "https://productwebsite.com",
      "category": "Productivity",
      "metrics": {"likes": 0, "retweets": 0, "replies": 0},
      "post_url": "https://nitter.net/username/status/123456"
    }
  ]
}

URL GUIDELINES:
- "url": Product's official website (NOT Nitter link)
- "post_url": The Nitter post where you found this product
- If no official website, set "url" to ""

Categories: ${categories.length > 0 ? categories.join(', ') : "'Text Generation', 'Image Generation', 'Audio Generation', 'Video Generation', 'Productivity', 'Development', 'Other'"}

CRITICAL: Return ONLY the JSON object, no explanations.`;

        return prompt;
    }

    // 显示Prompt预览
    function showPromptPreview() {
        const prompt = generatePrompt();
        generatedPrompt.textContent = prompt;
        promptModal.classList.remove('hidden');
    }

    // 关闭模态框
    function closeModal() {
        promptModal.classList.add('hidden');
    }
    
    // 初始化分类管理
    async function initializeCategoryManagement() {
        // 从服务器加载设置
        await loadCategorySettings();
        // 渲染分类选择器
        renderCategoryCheckboxes();
    }
    
    // 加载分类设置
    async function loadCategorySettings() {
        try {
            const response = await fetch('/api/categories');
            if (response.ok) {
                const settings = await response.json();
                categorySettings = settings;
                console.log('从MySQL数据库加载分类设置成功');
            } else {
                const error = await response.json();
                console.error('加载分类设置失败:', error.error);
                // 使用默认设置
                categorySettings = {
                    preset: [
                        { value: 'Text Generation', label: '文本生成', enabled: true },
                        { value: 'Image Generation', label: '图像生成', enabled: true },
                        { value: 'Productivity', label: '生产力工具', enabled: true },
                        { value: 'Development', label: '开发工具', enabled: true }
                    ],
                    custom: []
                };
            }
        } catch (error) {
            console.error('加载分类设置时出错:', error);
            // 使用默认设置
            categorySettings = {
                preset: [
                    { value: 'Text Generation', label: '文本生成', enabled: true },
                    { value: 'Image Generation', label: '图像生成', enabled: true },
                    { value: 'Productivity', label: '生产力工具', enabled: true },
                    { value: 'Development', label: '开发工具', enabled: true }
                ],
                custom: []
            };
        }
    }
    
    // 保存分类设置
    async function saveCategorySettings() {
        try {
            const response = await fetch('/api/categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(categorySettings)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('分类设置保存到MySQL成功:', result.message);
                return true;
            } else {
                const error = await response.json();
                console.error('保存分类设置失败:', error.error);
                return false;
            }
        } catch (error) {
            console.error('保存分类设置时出错:', error);
            return false;
        }
    }
    
    // 渲染分类复选框
    function renderCategoryCheckboxes() {
        categoriesContainer.innerHTML = '';
        
        // 渲染预设分类
        categorySettings.preset.forEach(category => {
            if (category.enabled) {
                const label = document.createElement('label');
                label.className = 'checkbox-label';
                label.innerHTML = `
                    <input type="checkbox" name="categories" value="${category.value}" checked>
                    ${category.label}
                `;
                categoriesContainer.appendChild(label);
            }
        });
        
        // 渲染自定义分类
        categorySettings.custom.forEach(category => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = `
                <input type="checkbox" name="categories" value="${category.value}" checked>
                ${category.label} <span style="color: var(--primary-color); font-size: 0.8em;">(自定义)</span>
            `;
            categoriesContainer.appendChild(label);
        });
    }
    
    // 显示分类管理模态框
    function showCategoryModal() {
        renderCategoryManagement();
        categoryModal.classList.remove('hidden');
    }
    
    // 关闭分类管理模态框
    function closeCategoryModal() {
        categoryModal.classList.add('hidden');
    }
    
    // 渲染分类管理界面
    function renderCategoryManagement() {
        const presetContainer = document.getElementById('preset-categories');
        const customContainer = document.getElementById('custom-categories');
        
        // 渲染预设分类
        presetContainer.innerHTML = '';
        categorySettings.preset.forEach((category, index) => {
            const item = document.createElement('div');
            item.className = `category-item ${category.enabled ? 'enabled' : ''}`;
            item.innerHTML = `
                <span class="category-name">${category.label}</span>
                <div class="category-controls">
                    <button class="category-toggle ${category.enabled ? 'enabled' : ''}" 
                            onclick="togglePresetCategory(${index})"></button>
                </div>
            `;
            presetContainer.appendChild(item);
        });
        
        // 渲染自定义分类
        customContainer.innerHTML = '';
        if (categorySettings.custom.length === 0) {
            customContainer.innerHTML = '<div class="empty-state">暂无自定义分类</div>';
        } else {
            categorySettings.custom.forEach((category, index) => {
                const item = document.createElement('div');
                item.className = 'category-item custom';
                item.innerHTML = `
                    <span class="category-name">${category.label}</span>
                    <div class="category-controls">
                        <button class="category-remove" onclick="removeCustomCategory(${index})">×</button>
                    </div>
                `;
                customContainer.appendChild(item);
            });
        }
        
        // 绑定添加分类事件
        const addBtn = document.getElementById('add-category-btn');
        const newCategoryInput = document.getElementById('new-category-input');
        
        addBtn.onclick = addCustomCategory;
        newCategoryInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                addCustomCategory();
            }
        };
        
        // 绑定保存和重置事件
        document.getElementById('save-categories').onclick = saveCategoriesAndClose;
        document.getElementById('reset-to-default').onclick = resetToDefault;
    }
    
    // 切换预设分类状态
    function togglePresetCategory(index) {
        categorySettings.preset[index].enabled = !categorySettings.preset[index].enabled;
        renderCategoryManagement();
    }
    
    // 添加自定义分类
    function addCustomCategory() {
        const input = document.getElementById('new-category-input');
        const name = input.value.trim();
        
        if (!name) {
            alert('请输入分类名称');
            return;
        }
        
        // 检查是否已存在
        const exists = [...categorySettings.preset, ...categorySettings.custom]
            .some(cat => cat.value.toLowerCase() === name.toLowerCase() || cat.label === name);
        
        if (exists) {
            alert('该分类已存在');
            return;
        }
        
        // 添加新分类
        categorySettings.custom.push({
            value: name,
            label: name,
            enabled: true
        });
        
        input.value = '';
        renderCategoryManagement();
    }
    
    // 删除自定义分类
    function removeCustomCategory(index) {
        if (confirm('确定要删除这个自定义分类吗？')) {
            categorySettings.custom.splice(index, 1);
            renderCategoryManagement();
        }
    }
    
    // 保存分类设置并关闭
    async function saveCategoriesAndClose() {
        const success = await saveCategorySettings();
        if (success) {
            renderCategoryCheckboxes();
            closeCategoryModal();
            alert('分类设置已保存到MySQL数据库！');
        } else {
            alert('保存失败，请重试');
        }
    }
    
    // 重置为默认设置
    async function resetToDefault() {
        if (confirm('确定要重置为默认分类设置吗？这将删除所有自定义分类。')) {
            try {
                const response = await fetch('/api/categories/reset', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                if (response.ok) {
                    const result = await response.json();
                    categorySettings = result.settings;
                    renderCategoryManagement();
                    alert('已重置为默认设置！');
                } else {
                    const error = await response.json();
                    alert('重置失败: ' + error.error);
                }
            } catch (error) {
                console.error('重置分类设置时出错:', error);
                alert('重置失败，请重试');
            }
        }
    }
    
    // 全选分类
    function selectAllCategories() {
        const checkboxes = categoriesContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
    }
    
    // 全不选分类
    function deselectAllCategories() {
        const checkboxes = categoriesContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    }
    
    // 重置为默认选择
    function resetToDefaultCategories() {
        const checkboxes = categoriesContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const category = [...categorySettings.preset, ...categorySettings.custom]
                .find(cat => cat.value === cb.value);
            cb.checked = category && category.enabled;
        });
    }
    
    // 将函数暴露到全局作用域，供HTML内联事件使用
    window.togglePresetCategory = togglePresetCategory;
    window.addCustomCategory = addCustomCategory;
    window.removeCustomCategory = removeCustomCategory;

    // 处理搜索
    async function handleSearch(e) {
        e.preventDefault();
        
        const prompt = generatePrompt();

        // 重置UI状态
        resetUI();
        
        // 显示加载状态
        searchBtn.disabled = true;
        searchBtn.textContent = '搜索中...';
        taskStatus.classList.remove('hidden');
        loading.classList.remove('hidden');

        try {
            // 发起搜索请求
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            currentTaskId = data.task_id;
            
            // 显示任务控制面板
            taskControls.classList.remove('hidden');
            taskIdDisplay.textContent = `任务ID: ${currentTaskId}`;
            
            // 显示实时预览
            if (data.live_url) {
                showLivePreview(data.live_url);
            }

            // 开始轮询任务状态
            startStatusPolling();

        } catch (error) {
            console.error('搜索失败:', error);
            alert('搜索失败: ' + error.message);
            resetUI();
        }
    }

    // 显示实时预览
    function showLivePreview(liveUrl) {
        console.log('[DEBUG] showLivePreview called with:', liveUrl);
        livePreview.classList.remove('hidden');
        previewIframe.src = liveUrl;
        previewLink.href = liveUrl;
        console.log('[DEBUG] iframe src set to:', previewIframe.src);
        console.log('[DEBUG] live preview should now be visible');
    }

    // 手动检查结果
    async function manualCheckResult() {
        if (!currentTaskId) {
            alert('没有正在执行的任务');
            return;
        }

        checkResultBtn.disabled = true;
        checkResultBtn.textContent = '检查中...';

        try {
            await checkTaskStatus();
        } catch (error) {
            console.error('手动检查结果失败:', error);
            alert('检查结果失败: ' + error.message);
        } finally {
            checkResultBtn.disabled = false;
            checkResultBtn.textContent = '手动检查结果';
        }
    }

    // 刷新预览
    function refreshPreview() {
        if (previewIframe.src) {
            console.log('[DEBUG] 刷新预览iframe');
            const currentSrc = previewIframe.src;
            previewIframe.src = '';
            setTimeout(() => {
                previewIframe.src = currentSrc;
            }, 100);
        } else {
            alert('没有可刷新的预览');
        }
    }

    // 轮询任务状态
    function startStatusPolling() {
        let pollCount = 0;
        const maxPolls = 360; // 增加到30分钟（5秒一次）

        // 立即检查一次状态
        checkTaskStatus();

        statusCheckInterval = setInterval(async () => {
            pollCount++;
            
            if (pollCount > maxPolls) {
                clearInterval(statusCheckInterval);
                statusText.textContent = '任务执行时间过长，但可能仍在后台运行。请手动刷新页面检查结果。';
                // 不重置UI，保持iframe显示
                searchBtn.disabled = false;
                searchBtn.textContent = '开始搜索';
                return;
            }

            await checkTaskStatus();
        }, 5000); // 每5秒检查一次
    }

    // 检查任务状态
    async function checkTaskStatus() {
        try {
            const response = await fetch(`/api/task/${currentTaskId}/status`);
            const data = await response.json();
            
            console.log('[DEBUG] 任务状态响应:', data);

            updateStatusUI(data.status);

            // 如果返回了live_url但还没有显示，显示它
            if (data.live_url && (!previewIframe.src || previewIframe.src === 'about:blank' || previewIframe.src === '')) {
                console.log('[DEBUG] 显示实时预览:', data.live_url);
                showLivePreview(data.live_url);
            }

            // 任务完成
            if (['finished', 'failed', 'stopped'].includes(data.status)) {
                clearInterval(statusCheckInterval);
                loading.classList.add('hidden');

                if (data.status === 'finished' && data.result) {
                    displayResults(data.result);
                } else if (data.status === 'failed') {
                    statusText.textContent = '任务失败';
                    alert('搜索任务失败，请重试');
                }

                searchBtn.disabled = false;
                searchBtn.textContent = '开始搜索';
            }

        } catch (error) {
            console.error('状态检查失败:', error);
        }
    }

    // 更新状态UI
    function updateStatusUI(status) {
        const statusMap = {
            'created': '任务已创建，正在初始化浏览器...',
            'running': '🔍 AI正在搜索中... 预计需要10分钟左右',
            'finished': '✅ 搜索完成！',
            'failed': '❌ 任务失败',
            'stopped': '⏹️ 任务已停止'
        };

        statusText.textContent = statusMap[status] || status;
        
        // 如果任务正在运行，显示额外的提示
        if (status === 'running') {
            // 创建或更新运行时提示
            let runningHint = document.querySelector('.running-hint');
            if (!runningHint) {
                runningHint = document.createElement('p');
                runningHint.className = 'running-hint';
                runningHint.style.color = 'var(--text-secondary)';
                runningHint.style.fontSize = '0.9rem';
                runningHint.style.marginTop = '0.5rem';
                statusText.parentNode.insertBefore(runningHint, statusText.nextSibling);
            }
            runningHint.textContent = '💡 提示：AI正在执行多个搜索查询并分析内容，您可以在下方查看实时执行过程。如果预览消失，请点击"刷新预览"按钮。';
        }
    }

    // 显示搜索结果
    function displayResults(data) {
        if (!data) {
            resultsSection.classList.add('hidden');
            return;
        }

        // 清空现有结果
        productsGrid.innerHTML = '';

        // 显示搜索总结
        const searchSummary = document.getElementById('search-summary');
        if (data.summary) {
            const summaryText = searchSummary.querySelector('.summary-text');
            const totalCount = searchSummary.querySelector('.total-count');
            
            summaryText.textContent = data.summary;
            if (data.total_found !== undefined) {
                totalCount.textContent = `共找到 ${data.total_found} 个AI产品`;
            } else if (data.products && data.products.length > 0) {
                totalCount.textContent = `共找到 ${data.products.length} 个AI产品`;
            } else {
                totalCount.textContent = `未找到符合条件的AI产品`;
            }
            searchSummary.classList.remove('hidden');
        } else {
            searchSummary.classList.add('hidden');
        }

        // 更新统计信息
        const count = data.products ? data.products.length : 0;
        productCount.textContent = `找到 ${count} 个产品`;
        searchNote.textContent = data.note || '';

        // 显示搜索说明
        const searchNoteSection = document.getElementById('search-note-section');
        if (data.note) {
            const noteText = searchNoteSection.querySelector('.note-text');
            noteText.textContent = data.note;
            searchNoteSection.classList.remove('hidden');
        } else {
            searchNoteSection.classList.add('hidden');
        }

        // 显示结果区域
        resultsSection.classList.remove('hidden');

        // 渲染产品卡片
        if (data.products && data.products.length > 0) {
            data.products.forEach(product => {
                const card = createProductCard(product);
                productsGrid.appendChild(card);
            });
        } else {
            // 显示无结果提示
            productsGrid.innerHTML = '<div class="no-results">未找到符合条件的AI产品，请尝试调整搜索条件或时间范围。</div>';
        }

        // 滚动到结果区域
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    // 创建产品卡片
    function createProductCard(product) {
        const template = document.getElementById('product-card-template');
        const card = template.content.cloneNode(true);

        // 填充产品信息
        card.querySelector('.product-name').textContent = product.name;
        card.querySelector('.product-category').textContent = product.category;
        card.querySelector('.product-description').textContent = product.description;

        // 填充指标数据
        const metrics = product.metrics || {};
        card.querySelector('.likes .count').textContent = metrics.likes || 0;
        card.querySelector('.retweets .count').textContent = metrics.retweets || 0;
        card.querySelector('.replies .count').textContent = metrics.replies || 0;

        // 设置链接
        const productUrl = card.querySelector('.product-url');
        const postUrl = card.querySelector('.post-url');

        // 处理产品链接（官方网站）
        if (product.url && product.url.trim() && product.url !== '#' && !product.url.includes('nitter')) {
            productUrl.href = product.url;
            productUrl.classList.remove('disabled');
        } else {
            productUrl.href = '#';
            productUrl.classList.add('disabled');
            productUrl.addEventListener('click', (e) => e.preventDefault());
        }

        // 处理推文链接（Twitter/Nitter帖子）
        if (product.post_url && product.post_url.trim() && product.post_url !== '#') {
            postUrl.href = product.post_url;
            postUrl.classList.remove('disabled');
        } else {
            postUrl.href = '#';
            postUrl.classList.add('disabled');
            postUrl.addEventListener('click', (e) => e.preventDefault());
        }

        return card;
    }

    // 重置UI状态
    function resetUI() {
        searchBtn.disabled = false;
        searchBtn.textContent = '开始搜索';
        taskStatus.classList.add('hidden');
        taskControls.classList.add('hidden');
        loading.classList.add('hidden');
        livePreview.classList.add('hidden');
        previewIframe.src = '';
        taskIdDisplay.textContent = '';
        currentTaskId = null;
        
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    }
}); 