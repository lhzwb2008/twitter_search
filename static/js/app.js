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

    let currentTaskId = null;
    let statusCheckInterval = null;

    // 初始化标签输入
    initializeTagInputs();

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

        // 构建简化的Prompt
        const keywordStr = keywords.length > 0 ? keywords.join(' OR ') : 'AI app';
        const excludeStr = excludeCompanies.length > 0 ? excludeCompanies.map(c => `-from:${c}`).join(' ') : '-from:Google -from:Microsoft -from:OpenAI';
        
        let prompt = `Find ${resultLimit} newly launched AI products from startups on https://nitter.privacyredirect.com/ within ${startDate} to ${endDate}.

Simple Search:
- Query: "${keywordStr}" launch since:${startDate} until:${endDate} ${excludeStr}
- Look for posts with product links (websites, demos)
- Extract essential info only

For each product:
- name: Product name
- description: Brief description (max 20 words)
- url: Product website/demo link
- category: 'Text Generation', 'Image Generation', 'Productivity', or 'Other'
- metrics: {likes, retweets, replies}
- post_url: Nitter post link

Output JSON:
{
  "products": [
    {
      "name": "...",
      "description": "...",
      "url": "...",
      "category": "...",
      "metrics": {"likes": 0, "retweets": 0, "replies": 0},
      "post_url": "https://nitter.privacyredirect.com/..."
    }
  ]
}

Keep it simple: Find ${resultLimit} products maximum to complete quickly.`;

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
            'running': '🔍 AI正在搜索中... 这可能需要20-30分钟',
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
        if (!data || !data.products) {
            resultsSection.classList.add('hidden');
            return;
        }

        // 清空现有结果
        productsGrid.innerHTML = '';

        // 更新统计信息
        const count = data.products.length;
        productCount.textContent = `找到 ${count} 个产品`;
        searchNote.textContent = data.note || '';

        // 显示结果区域
        resultsSection.classList.remove('hidden');

        // 渲染产品卡片
        data.products.forEach(product => {
            const card = createProductCard(product);
            productsGrid.appendChild(card);
        });

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

        if (product.url) {
            productUrl.href = product.url;
        } else {
            productUrl.style.display = 'none';
        }

        if (product.post_url) {
            postUrl.href = product.post_url;
        } else {
            postUrl.style.display = 'none';
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