// AI产品搜索应用的前端逻辑
document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const searchForm = document.getElementById('search-form');
    const previewPromptBtn = document.getElementById('preview-prompt');
    const searchBtn = document.getElementById('search-btn');
    const taskStatus = document.getElementById('task-status');
    const statusText = document.querySelector('.status-text');
    const taskControls = document.getElementById('task-controls');

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
            { input: 'exclude-company-input', container: 'exclude-companies-tags' }
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
        const excludeCompanies = getTagValues('exclude-companies-tags');
        const categories = Array.from(document.querySelectorAll('input[name="categories"]:checked'))
            .map(cb => cb.value);

        // 构建灵活的Prompt
        const keywordStr = keywords.length > 0 ? keywords.join(' OR ') : 'AI app';
        const excludeStr = excludeCompanies.length > 0 ? excludeCompanies.map(c => `-from:${c}`).join(' ') : '-from:Google -from:Microsoft -from:OpenAI';
        
        let prompt = `You are an AI Product Discovery Expert. Perform a TWO-STAGE search to comprehensively discover AI products and their Twitter presence.

STAGE 1: PRODUCT DISCOVERY
Find at least ${resultLimit} AI-related products from Twitter mirror sites:

1. Try multiple Nitter instances:
   - https://nitter.privacyredirect.com/
   - https://nitter.net/
   - https://nitter.poast.org/
   - https://nitter.1d4.us/

2. Search Strategy:
   - Date range: ${startDate} to ${endDate}
   - Primary queries: "${keywordStr}" ${excludeStr}
   - Backup queries: "new AI" OR "AI launch" OR "AI startup"
   - Additional: "AI agent" OR "AI tool" OR "AI app"

3. For EACH product found, extract:
   - Product name, description, official website, category
   - The discovery post URL and metrics

STAGE 2: DEEP PRODUCT SEARCH
For EACH product discovered, perform additional searches:

1. Search queries for each product:
   - "[Product Name]"
   - "[Product Name] launch"
   - "[Product Name] review"
   - "[Product Name] demo"
   - "[Product Name] AI"

2. Collect ALL related posts for each product (aim for 3-10 posts per product):
   - Original announcements
   - User reviews and feedback
   - Demos and tutorials
   - News coverage
   - Community discussions

3. For EACH post:
   a) Click individual tweet to get specific URL
   b) Extract exact URL (https://nitter.net/username/status/NUMBERS)
   c) Get real metrics from individual post page
   d) Extract content, author, date

OUTPUT FORMAT (MANDATORY JSON ONLY):
{
  "products": [
    {
      "name": "Product Name",
      "description": "Brief description from discovery",
      "url": "https://productwebsite.com",
      "category": "Productivity",
      "discovery_post": {
        "post_url": "https://nitter.net/user/status/123",
        "metrics": {"likes": 5, "retweets": 2, "replies": 1, "views": 50}
      },
      "all_posts": [
        {
          "post_url": "https://nitter.net/user1/status/123",
          "content": "Post content",
          "author": "username",
          "post_date": "2024-01-01T12:00:00Z",
          "metrics": {"likes": 10, "retweets": 5, "replies": 2, "views": 100}
        }
      ]
    }
  ]
}

REQUIREMENTS:
- MUST find at least ${resultLimit} products
- Each product MUST have multiple posts (3-10 posts per product)
- All URLs must be specific individual posts, NOT search pages
- Extract real metrics from individual post pages
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
        
        // 收集搜索参数
        const formData = new FormData(searchForm);
        const searchParams = {
            keywords: getTagValues('keywords-tags'),
            start_date: formData.get('startDate') || '2025-06-01',
            end_date: formData.get('endDate') || '2025-07-01',
            categories: Array.from(document.querySelectorAll('input[name="categories"]:checked'))
                .map(cb => cb.value)
        };

        // 重置UI状态
        resetUI();
        
        // 显示加载状态
        searchBtn.disabled = true;
        searchBtn.textContent = '发现中...';
        taskStatus.classList.remove('hidden');
        loading.classList.remove('hidden');

        try {
            // 发起搜索请求
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    prompt,
                    search_params: searchParams
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // 检查是否需要重定向到结果页面
            if (data.redirect_to_results) {
                alert(data.message);
                window.location.href = '/results';
                return;
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
        console.log('[DEBUG] livePreview element:', livePreview);
        console.log('[DEBUG] previewIframe element:', previewIframe);
        console.log('[DEBUG] previewLink element:', previewLink);
        
        if (!livePreview || !previewIframe || !previewLink) {
            console.error('[ERROR] 实时预览元素获取失败!');
            return;
        }
        
        livePreview.classList.remove('hidden');
        previewIframe.src = liveUrl;
        previewLink.href = liveUrl;
        console.log('[DEBUG] iframe src set to:', previewIframe.src);
        console.log('[DEBUG] live preview should now be visible');
        console.log('[DEBUG] livePreview classes:', livePreview.className);
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
            console.log('[DEBUG] 当前iframe src:', previewIframe.src);
            console.log('[DEBUG] 是否有live_url:', !!data.live_url);

            updateStatusUI(data.status, data);

            // 如果返回了live_url，显示它
            if (data.live_url) {
                console.log('[DEBUG] 显示实时预览:', data.live_url);
                console.log('[DEBUG] 当前iframe src:', previewIframe.src);
                
                // 无论如何都显示live_url，因为它可能是最新的
                showLivePreview(data.live_url);
            } else {
                console.log('[DEBUG] 没有live_url返回');
            }

            // 显示中间进度（如果有）
            if (data.intermediate_progress && data.status === 'running') {
                displayIntermediateProgress(data.intermediate_progress);
            }

            // 任务完成、失败或部分成功
            if (['finished', 'failed', 'stopped', 'partial_success'].includes(data.status)) {
                clearInterval(statusCheckInterval);
                loading.classList.add('hidden');

                if ((data.status === 'finished' || data.status === 'partial_success') && data.result) {
                    displayResults(data.result, data.status === 'partial_success', data.recovered_from_logs);
                    
                    // 如果是部分成功，显示额外的提示信息
                    if (data.status === 'partial_success') {
                        showPartialSuccessMessage(data.message || '任务中断，但成功恢复了部分数据');
                    }
                } else if (data.status === 'failed') {
                    // 即使失败，也检查是否有恢复的数据
                    if (data.result && data.result.products && data.result.products.length > 0) {
                        displayResults(data.result, true, data.recovered_from_logs);
                        showPartialSuccessMessage('任务失败，但成功从执行日志中恢复了部分数据');
                    } else {
                        statusText.textContent = '任务失败';
                    }
                }

                searchBtn.disabled = false;
                searchBtn.textContent = '开始搜索';
            }

        } catch (error) {
            console.error('状态检查失败:', error);
        }
    }

    // 显示中间进度
    function displayIntermediateProgress(progressData) {
        if (!progressData || !progressData.products || progressData.products.length === 0) {
            return;
        }

        // 创建或更新中间进度显示区域
        let progressSection = document.getElementById('intermediate-progress');
        if (!progressSection) {
            progressSection = document.createElement('div');
            progressSection.id = 'intermediate-progress';
            progressSection.className = 'intermediate-progress';
            progressSection.innerHTML = `
                <div class="progress-header">
                    <h3>🔄 执行进度</h3>
                    <p class="progress-summary"></p>
                </div>
                <div class="progress-products"></div>
            `;
            
            // 插入到结果区域之前
            const resultsSection = document.getElementById('results');
            resultsSection.parentNode.insertBefore(progressSection, resultsSection);
        }

        const progressSummary = progressSection.querySelector('.progress-summary');
        const progressProducts = progressSection.querySelector('.progress-products');

        progressSummary.textContent = progressData.summary || `已发现 ${progressData.products.length} 个产品...`;

        // 显示已发现的产品
        progressProducts.innerHTML = '';
        progressData.products.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card intermediate';
            productCard.innerHTML = `
                <div class="product-header">
                    <h4 class="product-name">${product.name}</h4>
                    <span class="product-category">${product.category}</span>
                </div>
                <p class="product-description">${product.description || '正在收集更多信息...'}</p>
                <div class="product-source">
                    <span class="source-tag">进行中</span>
                </div>
            `;
            progressProducts.appendChild(productCard);
        });

        progressSection.classList.remove('hidden');
    }

    // 显示部分成功消息
    function showPartialSuccessMessage(message) {
        // 创建提示消息
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning';
        alertDiv.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">⚠️</div>
                <div class="alert-text">
                    <strong>部分成功</strong>
                    <p>${message}</p>
                </div>
            </div>
        `;

        // 插入到结果区域的顶部
        const resultsSection = document.getElementById('results');
        resultsSection.insertBefore(alertDiv, resultsSection.firstChild);

        // 5秒后自动隐藏
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 8000);
    }

    // 更新状态UI
    function updateStatusUI(status, data = {}) {
        const statusMap = {
            'created': '任务已创建，正在初始化浏览器...',
            'running': '🔍 AI正在搜索中... 预计需要10分钟左右',
            'finished': '✅ 搜索完成！',
            'failed': '❌ 任务失败',
            'stopped': '⏹️ 任务已停止',
            'partial_success': '⚠️ 任务中断，但成功恢复了数据'
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
            
            let hintText = '💡 提示：AI正在执行多个搜索查询并分析内容，您可以在下方查看实时执行过程。';
            
            // 如果有中间进度，更新提示文本
            if (data.intermediate_progress && data.intermediate_progress.products) {
                hintText += `已发现 ${data.intermediate_progress.products.length} 个产品。`;
            }
            
            runningHint.textContent = hintText;
        }
    }

    // 显示搜索结果
    function displayResults(data, isPartialSuccess = false, isRecovered = false) {
        if (!data) {
            resultsSection.classList.add('hidden');
            return;
        }

        // 隐藏中间进度显示
        const progressSection = document.getElementById('intermediate-progress');
        if (progressSection) {
            progressSection.classList.add('hidden');
        }

        // 清空现有结果
        productsGrid.innerHTML = '';

        // 显示搜索总结
        const searchSummary = document.getElementById('search-summary');
        if (data.summary) {
            const summaryText = searchSummary.querySelector('.summary-text');
            const totalCount = searchSummary.querySelector('.total-count');
            
            let summaryContent = data.summary;
            if (isRecovered) {
                summaryContent += ' (数据来源：执行日志恢复)';
            }
            
            summaryText.textContent = summaryContent;
            if (data.total_found !== undefined) {
                totalCount.textContent = `共找到 ${data.total_found} 个AI产品`;
            } else if (data.products && data.products.length > 0) {
                totalCount.textContent = `共找到 ${data.products.length} 个AI产品`;
            } else {
                totalCount.textContent = `未找到符合条件的AI产品`;
            }
            
            // 如果是恢复的数据，添加特殊样式
            if (isRecovered) {
                searchSummary.classList.add('recovered-data');
            }
            
            searchSummary.classList.remove('hidden');
        } else {
            searchSummary.classList.add('hidden');
        }

        // 显示产品列表
        if (data.products && data.products.length > 0) {
            data.products.forEach(product => {
                const productCard = createProductCard(product, isRecovered);
                productsGrid.appendChild(productCard);
            });
            resultsSection.classList.remove('hidden');
        } else {
            resultsSection.classList.add('hidden');
        }

        // 显示备注
        if (data.note) {
            const noteElement = document.getElementById('search-note');
            if (noteElement) {
                noteElement.textContent = data.note;
                noteElement.classList.remove('hidden');
            }
        }
    }

    // 创建产品卡片
    function createProductCard(product, isRecovered = false) {
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

        // 如果是恢复的数据，添加特殊样式
        if (isRecovered) {
            card.querySelector('.product-source').innerHTML = '<span class="source-tag recovered">从日志恢复</span>';
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
        

        
        // 清理中间进度显示
        const progressSection = document.getElementById('intermediate-progress');
        if (progressSection) {
            progressSection.remove();
        }
        
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    }
}); 