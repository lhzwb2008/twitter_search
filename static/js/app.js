// AI产品搜索应用的前端逻辑
document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const searchForm = document.getElementById('search-form');
    const previewPromptBtn = document.getElementById('preview-prompt');
    const refreshPreviewBtn = document.getElementById('refresh-preview-btn');
    const searchBtn = document.getElementById('search-btn');
    const taskStatus = document.getElementById('task-status');
    const taskControls = document.getElementById('task-controls');
    const taskIdDisplay = document.getElementById('task-id-display');
    const statusText = document.querySelector('.status-text');
    const livePreview = document.getElementById('live-preview');
    const previewLink = document.getElementById('preview-link');
    const productsGrid = document.getElementById('products-grid');
    const resultsSection = document.getElementById('results');
    
    // 模态框元素
    const promptModal = document.getElementById('prompt-modal');
    const modalClose = promptModal.querySelector('.modal-close');
    const generatedPrompt = document.getElementById('generated-prompt');
    
    // 分类管理元素
    const categoryModal = document.getElementById('category-modal');
    const categoryModalClose = categoryModal.querySelector('.modal-close');
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
                console.log('Category settings loaded from MySQL database successfully');
            } else {
                const error = await response.json();
                console.error('Failed to load category settings:', error.error);
                // 使用默认设置
                categorySettings = {
                    preset: [
                        { value: 'Text Generation', label: 'Text Generation', enabled: true },
                        { value: 'Image Generation', label: 'Image Generation', enabled: true },
                        { value: 'Video Generation', label: 'Video Generation', enabled: false },
                        { value: 'Audio Generation', label: 'Audio Generation', enabled: false },
                        { value: 'Productivity', label: 'Productivity', enabled: true },
                        { value: 'Development', label: 'Development', enabled: true },
                        { value: 'Entertainment', label: 'Entertainment', enabled: false },
                        { value: 'Education', label: 'Education', enabled: false },
                        { value: 'Business', label: 'Business', enabled: false },
                        { value: 'Healthcare', label: 'Healthcare', enabled: false },
                        { value: 'Design', label: 'Design', enabled: false },
                        { value: 'Other', label: 'Other', enabled: false }
                    ],
                    custom: []
                };
            }
        } catch (error) {
            console.error('Error loading category settings:', error);
            // 使用默认设置
            categorySettings = {
                preset: [
                    { value: 'Text Generation', label: 'Text Generation', enabled: true },
                    { value: 'Image Generation', label: 'Image Generation', enabled: true },
                    { value: 'Video Generation', label: 'Video Generation', enabled: false },
                    { value: 'Audio Generation', label: 'Audio Generation', enabled: false },
                    { value: 'Productivity', label: 'Productivity', enabled: true },
                    { value: 'Development', label: 'Development', enabled: true },
                    { value: 'Entertainment', label: 'Entertainment', enabled: false },
                    { value: 'Education', label: 'Education', enabled: false },
                    { value: 'Business', label: 'Business', enabled: false },
                    { value: 'Healthcare', label: 'Healthcare', enabled: false },
                    { value: 'Design', label: 'Design', enabled: false },
                    { value: 'Other', label: 'Other', enabled: false }
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
                console.log('Category settings saved to MySQL successfully:', result.message);
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
                ${category.label} <span style="color: var(--primary-color); font-size: 0.8em;">(Custom)</span>
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
            customContainer.innerHTML = '<div class="empty-state">No custom categories yet</div>';
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
            alert('Please enter a category name');
            return;
        }
        
        // 检查是否已存在
        const exists = [...categorySettings.preset, ...categorySettings.custom]
            .some(cat => cat.value.toLowerCase() === name.toLowerCase() || cat.label === name);
        
        if (exists) {
            alert('This category already exists');
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
        if (confirm('Are you sure you want to delete this custom category?')) {
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
            alert('Category settings saved successfully!');
        } else {
            alert('Save failed, please try again');
        }
    }
    
    // 重置为默认设置
    async function resetToDefault() {
        if (confirm('Are you sure you want to reset to default category settings? This will delete all custom categories.')) {
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
                    alert('Reset to default settings successfully!');
                } else {
                    const error = await response.json();
                    alert('Reset failed: ' + error.error);
                }
            } catch (error) {
                console.error('Error resetting category settings:', error);
                alert('Reset failed, please try again');
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
        const keywords = getTagValues('keywords-tags');
        const searchParams = {
            keywords: keywords.length > 0 ? keywords : ['AI app'], // 确保至少有一个关键词
            start_date: formData.get('startDate') || '2025-06-01',
            end_date: formData.get('endDate') || '2025-07-01',
            categories: Array.from(document.querySelectorAll('input[name="categories"]:checked'))
                .map(cb => cb.value)
        };

        // 重置UI状态
        resetUI();
        
        // 显示加载状态
        searchBtn.disabled = true;
        searchBtn.textContent = 'Discovering...';
        taskStatus.classList.remove('hidden');

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
            taskIdDisplay.textContent = `Task ID: ${currentTaskId}`;
            
            // 显示实时预览
            if (data.live_url) {
                showLivePreview(data.live_url);
            }

            // 开始轮询任务状态
            startStatusPolling();

        } catch (error) {
            console.error('Search failed:', error);
            alert('Search failed: ' + error.message);
            resetUI();
        }
    }

    // 显示实时预览
    function showLivePreview(liveUrl) {
        if (!liveUrl) return;
        
        console.log('[DEBUG] showLivePreview called with:', liveUrl);
        console.log('[DEBUG] livePreview element:', livePreview);
        console.log('[DEBUG] previewLink element:', previewLink);
        
        if (!livePreview || !previewLink) {
            console.error('[ERROR] Live preview elements not found!');
            return;
        }
        
        // 更新链接
        previewLink.href = liveUrl;
        previewLink.textContent = 'Open in New Window';
        
        // 显示预览容器
        livePreview.classList.remove('hidden');
        console.log('[DEBUG] Live preview link updated and shown');
    }



    // 刷新预览
    function refreshPreview() {
        if (previewLink.href && previewLink.href !== '#') {
            console.log('[DEBUG] Opening preview in new window');
            window.open(previewLink.href, '_blank');
        } else {
            alert('No preview to refresh');
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
                statusText.textContent = 'Task execution time exceeded, but may still be running in the background. Please manually refresh the page to check results.';
                // 不重置UI，保持iframe显示
                searchBtn.disabled = false;
                searchBtn.textContent = 'Discover AI Products';
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
            
            console.log('[DEBUG] Task status response:', data);
            console.log('[DEBUG] Has live_url:', !!data.live_url);

            updateStatusUI(data.status, data);

            // 显示任务步骤信息
            if (data.steps && data.steps.length > 0) {
                displayTaskSteps(data.steps);
            }
            
            // 不再显示Task Output和Output Files，因为Browser-Use Complete Results已经包含了所有信息
            // 移除这些显示以简化界面

            // 如果返回了live_url，显示它
            if (data.live_url) {
                console.log('[DEBUG] Showing live preview:', data.live_url);
                
                // 显示live_url
                showLivePreview(data.live_url);
            } else {
                console.log('[DEBUG] No live_url returned');
            }

            // 显示中间进度（如果有）
            if (data.intermediate_progress && data.status === 'running') {
                displayIntermediateProgress(data.intermediate_progress);
            }

            // 任务完成、失败或部分成功
            if (['finished', 'failed', 'stopped', 'partial_success'].includes(data.status)) {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                
                // 清理运行时的UI元素
                const runningHint = document.querySelector('.running-hint');
                if (runningHint) {
                    runningHint.remove();
                }
                
                const progressSection = document.getElementById('intermediate-progress');
                if (progressSection) {
                    progressSection.remove();
                }
                
                // 重置搜索按钮状态
                searchBtn.disabled = false;
                searchBtn.textContent = 'Discover AI Products';
                
                // 隐藏任务状态区域的加载提示
                const statusText = document.querySelector('.status-text');
                if (statusText && data.status === 'finished') {
                    statusText.textContent = '✅ Search completed!';
                }

                // 任务完成后，优先从数据库获取已入库的产品数据并显示搜索结果
                if (data.status === 'finished') {
                    // 尝试从数据库获取产品数据
                    loadDatabaseProducts(currentTaskId, statusText);
                } else if (data.parsed_products && data.parsed_products.products && data.parsed_products.products.length > 0) {
                    // 有产品数据，认为任务成功
                    displayResults(data.parsed_products, false, false);
                    statusText.textContent = '✅ 任务完成';
                } else if (data.execution_error) {
                    showExecutionErrorMessage(data.execution_error);
                    statusText.textContent = '⚠️ 任务执行遇到问题';
                } else if ((data.status === 'finished' || data.status === 'partial_success') && data.result) {
                    displayResults(data.result, data.status === 'partial_success', data.recovered_from_logs);
                    
                    // 如果是部分成功，显示额外的提示信息
                    if (data.status === 'partial_success') {
                        showPartialSuccessMessage(data.message || '任务中断，但成功恢复了部分数据');
                    }
                } else if (data.status === 'finished' && (!data.result && !data.parsed_products)) {
                    // 任务完成但没有有效结果
                    showExecutionErrorMessage('任务已完成但未找到有效的AI产品数据。这可能是由于网络问题或搜索目标网站不可访问导致的。');
                    statusText.textContent = '⚠️ 任务完成但无有效结果';
                } else if (data.status === 'failed') {
                    statusText.textContent = '❌ 任务执行失败';
                    showExecutionErrorMessage('任务执行失败，请检查网络连接或稍后重试。');
                } else {
                    // 对于stopped状态，也要重置UI
                    statusText.textContent = '⏹️ 任务已停止';
                    showExecutionErrorMessage('任务执行被中断，可能是由于网络问题或其他技术原因。');
                }
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

        progressSummary.textContent = progressData.summary || `Found ${progressData.products.length} products...`;

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

    // 显示未找到产品的建议消息
    function showNoProductsFoundMessage() {
        // 创建建议提示消息
        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'alert alert-info';
        suggestionDiv.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">💡</div>
                <div class="alert-text">
                    <strong>No products found</strong>
                    <p>The search task completed but no products were saved to the database. This might be due to:</p>
                    <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                        <li>Network connectivity issues during execution</li>
                        <li>Target websites being temporarily unavailable</li>
                        <li>Search terms not matching current content</li>
                    </ul>
                    <p><strong>Suggestion:</strong> Try refreshing the page and searching again with different keywords or date ranges.</p>
                </div>
                <button class="alert-action-btn" onclick="window.location.reload()">
                    🔄 Refresh & Try Again
                </button>
            </div>
        `;

        // 插入到任务状态区域
        const taskStatusElement = document.getElementById('task-status');
        if (taskStatusElement) {
            taskStatusElement.appendChild(suggestionDiv);
        }
    }

    // 显示执行错误消息
    function showExecutionErrorMessage(errorMessage) {
        // 创建错误提示消息
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">❌</div>
                <div class="alert-text">
                    <strong>任务执行遇到问题</strong>
                    <p>${errorMessage}</p>
                    <div class="alert-actions">
                        <button onclick="location.reload()" class="retry-btn primary">🔄 刷新页面重试</button>
                        <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" class="dismiss-btn secondary">关闭提示</button>
                    </div>
                </div>
            </div>
        `;

        // 插入到任务状态区域之后
        const taskStatus = document.getElementById('task-status');
        if (taskStatus && taskStatus.parentNode) {
            taskStatus.parentNode.insertBefore(errorDiv, taskStatus.nextSibling);
        } else {
            // 如果没有任务状态区域，插入到主容器的顶部
            const container = document.querySelector('.container main');
            if (container) {
                container.insertBefore(errorDiv, container.firstChild);
            }
        }

        // 自动滚动到错误消息
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 更新状态UI
    function updateStatusUI(status, data = {}) {
        const statusMap = {
            'created': 'Task created, initializing browser...',
            'running': '🔍 AI is searching... Estimated time: 10 minutes',
            'finished': '✅ Search completed!',
            'failed': '❌ Task failed',
            'stopped': '⏹️ Task stopped',
            'partial_success': '⚠️ Task interrupted, but data successfully recovered'
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
            
            let hintText = '💡 Hint: AI is performing multiple search queries and analyzing content. You can view the real-time execution process below.';
            
            // 如果有中间进度，更新提示文本
            if (data.intermediate_progress && data.intermediate_progress.products) {
                hintText += `已发现 ${data.intermediate_progress.products.length} 个产品。`;
            }
            
            runningHint.textContent = hintText;
        }
    }

    // 从数据库加载产品数据
    async function loadDatabaseProducts(taskId, statusText, retryCount = 0) {
        const maxRetries = 5;
        try {
            console.log(`[DEBUG] 从数据库加载任务 ${taskId} 的产品数据 (尝试 ${retryCount + 1}/${maxRetries})`);
            
            const response = await fetch(`/api/task/${taskId}/products`);
            const data = await response.json();
            
            console.log(`[DEBUG] API响应:`, data);
            
            if (response.ok && data.products && data.products.length > 0) {
                console.log(`[DEBUG] 成功从数据库获取 ${data.products.length} 个产品`);
                displayResults(data, false, false);
                statusText.textContent = `✅ 任务完成！已找到 ${data.products.length} 个AI产品并成功入库`;
                
                // 显示成功提示
                const successMessage = document.createElement('div');
                successMessage.style.cssText = `
                    background: #10b981; color: white; padding: 12px 20px; 
                    border-radius: 8px; margin: 15px 0; text-align: center;
                    font-weight: 500; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                `;
                successMessage.textContent = `🎉 搜索完成！在下方查看找到的 ${data.products.length} 个AI产品`;
                
                const taskStatusElement = document.getElementById('task-status');
                if (taskStatusElement) {
                    taskStatusElement.appendChild(successMessage);
                    
                    // 3秒后移除提示
                    setTimeout(() => {
                        if (successMessage.parentNode) {
                            successMessage.parentNode.removeChild(successMessage);
                        }
                    }, 5000);
                }
            } else {
                console.log(`[DEBUG] 数据库中暂无产品数据: ${data.message || '未知原因'}`);
                // 如果数据库中没有数据且还有重试次数，继续重试
                if (retryCount < maxRetries) {
                    statusText.textContent = `⏳ Waiting for products to be saved... (${retryCount + 1}/${maxRetries})`;
                    setTimeout(() => {
                        loadDatabaseProducts(taskId, statusText, retryCount + 1);
                    }, 3000); // 增加到3秒间隔
                } else {
                    statusText.textContent = '⚠️ No products found in database';
                    console.log('[DEBUG] 已达到最大重试次数，停止重试');
                    
                    // 显示重新搜索建议
                    showNoProductsFoundMessage();
                }
            }
        } catch (error) {
            console.error(`[DEBUG] 加载数据库产品数据失败:`, error);
            if (retryCount < maxRetries) {
                setTimeout(() => {
                    loadDatabaseProducts(taskId, statusText, retryCount + 1);
                }, 3000);
            } else {
                statusText.textContent = '⚠️ Failed to fetch product data';
                showNoProductsFoundMessage();
            }
        }
    }

    // 显示搜索结果
    function displayResults(data, isPartialSuccess = false, isRecovered = false) {
        console.log('[DEBUG] displayResults called with data:', data);
        
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
        console.log('[DEBUG] Cleared existing products grid');

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
                totalCount.textContent = `Found ${data.total_found} AI products`;
            } else if (data.products && data.products.length > 0) {
                totalCount.textContent = `Found ${data.products.length} AI products`;
            } else {
                totalCount.textContent = `No AI products found matching criteria`;
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
            console.log(`[DEBUG] Displaying ${data.products.length} products`);
            data.products.forEach((product, index) => {
                console.log(`[DEBUG] Creating card for product ${index + 1}:`, product);
                const productCard = createProductCard(product, isRecovered);
                productsGrid.appendChild(productCard);
            });
            resultsSection.classList.remove('hidden');
            console.log('[DEBUG] Results section made visible');
            
            // 自动滚动到结果区域
            setTimeout(() => {
                resultsSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }, 500);
        } else {
            console.log('[DEBUG] No products to display, hiding results section');
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
        const detailUrl = card.querySelector('.detail-url');

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

        // 处理详情页面链接
        if (product.id) {
            detailUrl.href = `/results?product=${product.id}`;
            detailUrl.classList.remove('disabled');
        } else {
            detailUrl.href = '#';
            detailUrl.classList.add('disabled');
            detailUrl.addEventListener('click', (e) => e.preventDefault());
        }

        // 如果是恢复的数据，添加特殊样式
        if (isRecovered) {
            card.querySelector('.product-source').innerHTML = '<span class="source-tag recovered">Recovered from logs</span>';
        }

        return card;
    }

    // 重置UI状态
    function resetUI() {
        // 清理任务信息
        clearTaskInfo();
        
        searchBtn.disabled = false;
        searchBtn.textContent = 'Discover AI Products';
        taskStatus.classList.add('hidden');
        taskControls.classList.add('hidden');
        livePreview.classList.add('hidden');
        
        // 重置预览链接
        if (previewLink) {
            previewLink.href = '#';
            previewLink.textContent = 'Waiting for preview link...';
        }
        
        taskIdDisplay.textContent = '';
        currentTaskId = null;
        displayedStepsCount = 0;
        
        // 清理错误提示
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => alert.remove());
        
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

    // 全局变量记录已显示的步骤数
    let displayedStepsCount = 0;

    // 显示任务步骤信息
    function displayTaskSteps(steps) {
        console.log('[DEBUG] Displaying task steps:', steps);
        
        // 检查步骤数据是否有效
        if (!steps || steps.length === 0) {
            console.log('[DEBUG] Step data is empty, do not display steps container');
            displayedStepsCount = 0;
            return;
        }
        
        // 检查步骤数据是否包含有效信息
        const hasValidSteps = steps.some(step => {
            return step && (
                step.action || step.next_goal || step.thinking || 
                step.evaluation_previous_goal || step.url
            );
        });
        
        if (!hasValidSteps) {
            console.log('[DEBUG] Step data has no valid content, do not display steps container');
            displayedStepsCount = 0;
            return;
        }
        
        // 创建或获取步骤容器
        let stepsContainer = document.getElementById('task-steps');
        if (!stepsContainer) {
            stepsContainer = document.createElement('div');
            stepsContainer.id = 'task-steps';
            stepsContainer.className = 'task-steps-container';
            
            // 插入到live preview之后
            const livePreview = document.getElementById('live-preview');
            if (livePreview && livePreview.parentNode) {
                livePreview.parentNode.insertBefore(stepsContainer, livePreview.nextSibling);
            } else {
                // 如果没有live preview，插入到任务状态区域
                const taskStatus = document.getElementById('task-status');
                if (taskStatus) {
                    taskStatus.appendChild(stepsContainer);
                }
            }
        }
        
        // 如果是第一次显示或步骤数量减少了（新任务），重新渲染所有步骤
        if (displayedStepsCount === 0 || steps.length < displayedStepsCount) {
            renderAllSteps(steps, stepsContainer);
            displayedStepsCount = steps.length;
            return;
        }

        // 如果有新步骤，只添加新的步骤
        if (steps.length > displayedStepsCount) {
            addNewSteps(steps, stepsContainer);
            displayedStepsCount = steps.length;
            return;
        }

        // 如果步骤数量相同，更新步骤计数（可能内容有变化）
        updateStepsCount(steps.length);
    }

    function renderAllSteps(steps, stepsContainer) {
        // 生成步骤HTML，使用实际的数据字段
        const stepsHtml = steps.map((step, index) => {
            return generateStepHtml(step, index, steps.length);
        }).filter(html => html.trim()).join('');

        // 如果没有有效的步骤HTML，不显示容器
        if (!stepsHtml.trim()) {
            console.log('[DEBUG] Generated step HTML is empty, do not display steps container');
            return;
        }

        stepsContainer.innerHTML = `
            <div class="steps-header">
                <h3>Task Execution Steps</h3>
                <span class="steps-count">${steps.length} steps</span>
            </div>
            <div class="steps-list" id="steps-list-container">
                ${stepsHtml}
            </div>
        `;
        
        stepsContainer.style.display = 'block';
        
        // 自动滚动到最下方显示最新步骤
        setTimeout(() => {
            const stepsList = document.getElementById('steps-list-container');
            if (stepsList) {
                stepsList.scrollTop = stepsList.scrollHeight;
            }
        }, 100);
    }

    function addNewSteps(steps, stepsContainer) {
        const stepsList = document.getElementById('steps-list-container');
        if (!stepsList) return;

        // 移除所有现有的latest-step类和latest-indicator
        const existingSteps = stepsList.querySelectorAll('.step-item');
        existingSteps.forEach(step => {
            step.classList.remove('latest-step');
            const indicator = step.querySelector('.latest-indicator');
            if (indicator) {
                indicator.remove();
            }
        });

        // 只添加新的步骤
        for (let i = displayedStepsCount; i < steps.length; i++) {
            const stepHtml = generateStepHtml(steps[i], i, steps.length);
            if (stepHtml.trim()) {
                stepsList.insertAdjacentHTML('beforeend', stepHtml);
            }
        }

        // 重新标记最新的步骤
        const allSteps = stepsList.querySelectorAll('.step-item');
        const totalSteps = allSteps.length;
        for (let i = Math.max(0, totalSteps - 3); i < totalSteps; i++) {
            allSteps[i].classList.add('latest-step');
            if (!allSteps[i].querySelector('.latest-indicator')) {
                allSteps[i].insertAdjacentHTML('beforeend', '<div class="latest-indicator">Latest</div>');
            }
        }

        // 更新步骤计数
        updateStepsCount(steps.length);

        // 平滑滚动到最新步骤
        setTimeout(() => {
            stepsList.scrollTop = stepsList.scrollHeight;
        }, 50);
    }

    function updateStepsCount(count) {
        const stepsCountElement = document.querySelector('.steps-count');
        if (stepsCountElement) {
            stepsCountElement.textContent = `${count} steps`;
        }
    }

    function generateStepHtml(step, index, totalSteps) {
        // 提取步骤信息，适配browser-use的实际数据结构
        const stepNumber = step.step || (index + 1);
        const action = step.action || step.next_goal || 'Step Action';
        const description = step.description || step.thinking || step.evaluation_previous_goal || 'No description';
        const time = step.time || step.timestamp || '';
        const url = step.url || '';
        
        // 如果所有关键信息都为空，跳过这个步骤
        if (!action || action === 'Unknown Action') {
            if (!description || description === 'No description') {
                return '';
            }
        }
        
        // 标记最新的步骤（最后3个步骤）
        const isLatest = index >= totalSteps - 3;
        const latestClass = isLatest ? ' latest-step' : '';
        
        return `
            <div class="step-item${latestClass}">
                <div class="step-number">${stepNumber}</div>
                <div class="step-content">
                    <div class="step-action">${action}</div>
                    <div class="step-description">${description}</div>
                    ${time ? `<div class="step-time">${time}</div>` : ''}
                    ${url ? `<div class="step-url">URL: ${url}</div>` : ''}
                </div>
                ${isLatest ? '<div class="latest-indicator">Latest</div>' : ''}
            </div>
        `;
    }
    
    // 已移除displayTaskOutput函数 - 不再显示Task Output，因为Browser-Use Complete Results已包含所有信息
    
    // 已移除displayOutputFiles函数 - 不再显示Output Files，简化界面显示
    
    // 显示 browser-use 完整结果
    function displayBrowserUseResults(data) {
        console.log('[DEBUG] Displaying browser-use results:', data);
        
        // 创建或获取 browser-use 结果容器
        let browserUseContainer = document.getElementById('browser-use-results');
        if (!browserUseContainer) {
            browserUseContainer = document.createElement('div');
            browserUseContainer.id = 'browser-use-results';
            browserUseContainer.className = 'browser-use-results-container';
            
            // 插入到任务状态区域之后
            const taskStatus = document.getElementById('task-status');
            if (taskStatus && taskStatus.parentNode) {
                taskStatus.parentNode.insertBefore(browserUseContainer, taskStatus.nextSibling);
            }
        }
        
        // 构建结果HTML
        let resultHtml = `
            <div class="browser-use-header">
                <h3>🤖 Browser-Use Complete Results</h3>
                <div class="result-meta">
                    <span>Status: ${data.status}</span>
                    ${data.created_at ? `<span>Created: ${new Date(data.created_at).toLocaleString()}</span>` : ''}
                    ${data.finished_at ? `<span>Finished: ${new Date(data.finished_at).toLocaleString()}</span>` : ''}
                </div>
            </div>
        `;
        
        // 显示原始输出
        if (data.raw_output) {
            resultHtml += `
                <div class="raw-output-section">
                    <h4>📄 Raw Output</h4>
                    <div class="raw-output-content">
                        <pre>${data.raw_output}</pre>
                    </div>
                </div>
            `;
        }
        
        // 显示解析后的产品数据
        if (data.parsed_products && data.parsed_products.products && data.parsed_products.products.length > 0) {
            resultHtml += `
                <div class="raw-output-section">
                    <h4>✅ Parsed Products (${data.parsed_products.products.length})</h4>
                    <div class="raw-output-content">
                        <pre>${JSON.stringify(data.parsed_products.products, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
        
        // 不显示Generated Files部分，因为文件通常无法访问且不需要展示给用户
        // if (data.output_files_content && Object.keys(data.output_files_content).length > 0) {
        //     resultHtml += `
        //         <div class="output-files-section">
        //             <h4>📁 Generated Files</h4>
        //     `;
        //     
        //     Object.entries(data.output_files_content).forEach(([filename, content]) => {
        //         resultHtml += `
        //             <div class="file-content">
        //                 <h5>${filename}</h5>
        //                 <div class="file-content-body">
        //                     <pre>${content}</pre>
        //                 </div>
        //             </div>
        //         `;
        //     });
        //     
        //     resultHtml += `</div>`;
        // } else if (data.output_files && data.output_files.length > 0) {
        //     // 如果有文件列表但没有内容，显示文件列表
        //     resultHtml += `
        //         <div class="output-files-section">
        //             <h4>📁 Output Files (Content not available)</h4>
        //             <div class="files-list">
        //                 ${data.output_files.map(file => `<div class="file-item"><span class="file-name">${file}</span></div>`).join('')}
        //             </div>
        //         </div>
        //     `;
        // }
        
        // 显示其他元数据
        if (data.metadata || data.browser_data) {
            resultHtml += `
                <div class="raw-output-section">
                    <h4>🔧 Metadata</h4>
                    <div class="raw-output-content">
                        <pre>${JSON.stringify({
                            metadata: data.metadata,
                            browser_data: data.browser_data
                        }, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
        
        browserUseContainer.innerHTML = resultHtml;
        browserUseContainer.style.display = 'block';
    }
    
    // 显示输出文件内容
    function displayOutputFilesContent(outputFilesContent) {
        console.log('[DEBUG] Displaying output files content:', outputFilesContent);
        
        // 检查文件内容是否有效
        if (!outputFilesContent || Object.keys(outputFilesContent).length === 0) {
            console.log('[DEBUG] Output files content is empty, do not display files content container');
            return;
        }
        
        // 创建或获取文件内容容器
        let filesContentContainer = document.getElementById('output-files-content');
        if (!filesContentContainer) {
            filesContentContainer = document.createElement('div');
            filesContentContainer.id = 'output-files-content';
            filesContentContainer.className = 'output-files-content-container';
            
            // 插入到文件列表之后
            const filesContainer = document.getElementById('output-files');
            if (filesContainer && filesContainer.parentNode) {
                filesContainer.parentNode.insertBefore(filesContentContainer, filesContainer.nextSibling);
            } else {
                // 如果没有文件容器，插入到任务状态区域
                const taskStatus = document.getElementById('task-status');
                if (taskStatus) {
                    taskStatus.appendChild(filesContentContainer);
                }
            }
        }
        
        const filesContentHtml = Object.entries(outputFilesContent).map(([filename, content]) => `
            <div class="file-content">
                <h5>${filename}</h5>
                <div class="file-content-body">
                    <pre>${content}</pre>
                </div>
            </div>
        `).join('');
        
        filesContentContainer.innerHTML = `
            <div class="files-content-header">
                <h3>File Contents</h3>
                <span class="files-count">${Object.keys(outputFilesContent).length} files</span>
            </div>
            <div class="files-content-list">
                ${filesContentHtml}
            </div>
        `;
        
        filesContentContainer.style.display = 'block';
    }
    
    // 清理任务信息显示
    function clearTaskInfo() {
        console.log('[DEBUG] Clearing task info display');
        
        // 清理步骤信息
        const stepsContainer = document.getElementById('task-steps');
        if (stepsContainer) {
            stepsContainer.remove();
        }
        
        // 清理输出信息
        const outputContainer = document.getElementById('task-output');
        if (outputContainer) {
            outputContainer.remove();
        }
        
        // 清理文件信息
        const filesContainer = document.getElementById('output-files');
        if (filesContainer) {
            filesContainer.remove();
        }
        
        // 清理文件内容信息
        const filesContentContainer = document.getElementById('output-files-content');
        if (filesContentContainer) {
            filesContentContainer.remove();
        }
        
        // 清理 browser-use 结果
        const browserUseContainer = document.getElementById('browser-use-results');
        if (browserUseContainer) {
            browserUseContainer.remove();
        }
    }
});