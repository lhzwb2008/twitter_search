// 结果页面JavaScript逻辑
document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const searchList = document.getElementById('search-list');
    const productDetail = document.getElementById('product-detail');
    const statusFilter = document.getElementById('status-filter');
    const keywordFilter = document.getElementById('keyword-filter');
    const backToListBtn = document.getElementById('back-to-list');
    const refreshPostsBtn = document.getElementById('refresh-posts');

    let currentProductId = null;

    // 初始化
    loadSearchRecords();

    // 事件监听器
    statusFilter.addEventListener('change', loadSearchRecords);
    keywordFilter.addEventListener('input', debounce(loadSearchRecords, 500));
    backToListBtn.addEventListener('click', showSearchList);
    refreshPostsBtn.addEventListener('click', refreshProductPosts);

    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 加载搜索记录
    async function loadSearchRecords() {
        try {
            const params = new URLSearchParams();
            if (statusFilter.value) params.append('status', statusFilter.value);
            if (keywordFilter.value) params.append('keyword', keywordFilter.value);

            const response = await fetch(`/api/search-records?${params}`);
            const data = await response.json();

            if (response.ok) {
                renderSearchRecords(data.records);
            } else {
                console.error('加载搜索记录失败:', data.error);
                searchList.innerHTML = '<div class="no-results">加载搜索记录失败</div>';
            }
        } catch (error) {
            console.error('加载搜索记录时出错:', error);
            searchList.innerHTML = '<div class="no-results">网络错误，请重试</div>';
        }
    }

    // 渲染搜索记录
    function renderSearchRecords(records) {
        if (records.length === 0) {
            searchList.innerHTML = '<div class="no-results">暂无搜索记录</div>';
            return;
        }

        searchList.innerHTML = '';
        records.forEach(record => {
            const recordElement = createSearchRecordElement(record);
            searchList.appendChild(recordElement);
        });
    }

    // 创建搜索记录元素
    function createSearchRecordElement(record) {
        const template = document.getElementById('search-record-template');
        const element = template.content.cloneNode(true);

        // 填充数据
        const keywordsText = Array.isArray(record.keywords) ? record.keywords.join(', ') : '未知';
        element.querySelector('.record-keywords').textContent = keywordsText;
        
        const dateRange = `${record.start_date} 至 ${record.end_date}`;
        element.querySelector('.record-date').textContent = dateRange;
        
        const statusElement = element.querySelector('.record-status');
        statusElement.textContent = getStatusText(record.status);
        statusElement.className = `record-status ${record.status}`;
        
        element.querySelector('.record-count').textContent = `${record.total_products} 个产品`;

        // 绑定查看产品事件
        const viewBtn = element.querySelector('.view-products-btn');
        viewBtn.addEventListener('click', () => viewSearchProducts(record.id));

        // 绑定删除事件
        const deleteBtn = element.querySelector('.delete-record-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发其他事件
            deleteSearchRecord(record.id, record.keywords);
        });

        return element;
    }

    // 获取状态文本
    function getStatusText(status) {
        const statusMap = {
            'pending': '等待中',
            'running': '进行中',
            'completed': '已完成',
            'failed': '失败'
        };
        return statusMap[status] || status;
    }

    // 查看搜索的产品
    async function viewSearchProducts(searchId) {
        try {
            const response = await fetch(`/api/search-records/${searchId}/products`);
            const data = await response.json();

            if (response.ok) {
                if (data.products.length > 0) {
                    // 如果只有一个产品，直接显示详情
                    if (data.products.length === 1) {
                        showProductDetail(data.products[0].id);
                    } else {
                        // 显示产品列表供选择
                        showProductSelection(data.products);
                    }
                } else {
                    alert('该搜索暂无产品数据');
                }
            } else {
                console.error('获取产品列表失败:', data.error);
                alert('获取产品列表失败');
            }
        } catch (error) {
            console.error('获取产品列表时出错:', error);
            alert('网络错误，请重试');
        }
    }

    // 显示产品选择界面（多个产品时）
    function showProductSelection(products) {
        // 创建产品选择模态框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>选择要查看的产品</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="product-selection-list">
                        ${products.map(product => `
                            <div class="product-selection-item" data-product-id="${product.id}">
                                <div class="product-info">
                                    <h4>${product.name}</h4>
                                    <p>${product.description || '无描述'}</p>
                                    <div class="product-metrics">
                                        <span>👍 ${product.total_likes}</span>
                                        <span>🔄 ${product.total_retweets}</span>
                                        <span>💬 ${product.total_replies}</span>
                                    </div>
                                </div>
                                <button class="view-detail-btn">查看详情</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定事件
        modal.querySelector('.modal-close').addEventListener('click', (e) => {
            e.stopPropagation();
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        modal.querySelectorAll('.view-detail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = parseInt(e.target.closest('.product-selection-item').dataset.productId);
                document.body.removeChild(modal);
                showProductDetail(productId);
            });
        });
    }

    // 显示产品详情
    async function showProductDetail(productId) {
        try {
            currentProductId = productId;
            
            const response = await fetch(`/api/products/${productId}`);
            const data = await response.json();

            if (response.ok) {
                renderProductDetail(data.product, data.posts);
                
                // 切换到详情视图
                document.querySelector('.search-history').classList.add('hidden');
                productDetail.classList.remove('hidden');
            } else {
                console.error('获取产品详情失败:', data.error);
                alert('获取产品详情失败');
            }
        } catch (error) {
            console.error('获取产品详情时出错:', error);
            alert('网络错误，请重试');
        }
    }

    // 渲染产品详情
    function renderProductDetail(product, posts) {
        // 更新产品基本信息
        document.getElementById('product-name').textContent = product.name;
        document.getElementById('detail-name').textContent = product.name;
        document.getElementById('detail-category').textContent = product.category || '未分类';
        document.getElementById('detail-description').textContent = product.description || '无描述';
        
        const urlElement = document.getElementById('detail-url');
        if (product.official_url) {
            urlElement.href = product.official_url;
            urlElement.style.display = 'inline';
        } else {
            urlElement.style.display = 'none';
        }

        // 更新社交数据汇总
        document.getElementById('total-posts').textContent = product.total_posts || 0;
        document.getElementById('total-likes').textContent = product.total_likes || 0;
        document.getElementById('total-retweets').textContent = product.total_retweets || 0;
        document.getElementById('total-replies').textContent = product.total_replies || 0;
        document.getElementById('total-views').textContent = product.total_views || 0;

        // 渲染推文列表
        renderPosts(posts);

        // 显示深度搜索按钮（如果未完成）
        if (!product.deep_search_completed) {
            showDeepSearchOption();
        }
    }

    // 渲染推文列表
    function renderPosts(posts) {
        const postsList = document.getElementById('posts-list');
        
        if (posts.length === 0) {
            postsList.innerHTML = '<div class="no-results">暂无相关推文</div>';
            return;
        }

        postsList.innerHTML = '';
        posts.forEach(post => {
            const postElement = createPostElement(post);
            postsList.appendChild(postElement);
        });
    }

    // 创建推文元素
    function createPostElement(post) {
        const template = document.getElementById('post-template');
        const element = template.content.cloneNode(true);

        // 填充数据
        element.querySelector('.post-author').textContent = post.author || '未知用户';
        element.querySelector('.post-date').textContent = post.post_date ? 
            new Date(post.post_date).toLocaleString() : '未知时间';
        element.querySelector('.post-content').textContent = post.content || '无内容';
        
        element.querySelector('.likes').textContent = post.likes || 0;
        element.querySelector('.retweets').textContent = post.retweets || 0;
        element.querySelector('.replies').textContent = post.replies || 0;
        element.querySelector('.views').textContent = post.views || 0;

        const linkElement = element.querySelector('.post-link a');
        if (post.post_url) {
            linkElement.href = post.post_url;
        } else {
            linkElement.style.display = 'none';
        }

        // 标记原始推文
        if (post.is_original) {
            element.querySelector('.post-item').classList.add('original-post');
        }

        return element;
    }

    // 显示深度搜索选项
    function showDeepSearchOption() {
        const existingBtn = document.getElementById('deep-search-btn');
        if (existingBtn) return; // 避免重复添加

        const deepSearchBtn = document.createElement('button');
        deepSearchBtn.id = 'deep-search-btn';
        deepSearchBtn.className = 'primary';
        deepSearchBtn.textContent = '🔍 深度搜索相关推文';
        deepSearchBtn.style.marginLeft = '1rem';

        deepSearchBtn.addEventListener('click', triggerDeepSearch);

        document.querySelector('.section-header').appendChild(deepSearchBtn);
    }

    // 触发深度搜索
    async function triggerDeepSearch() {
        if (!currentProductId) return;

        const deepSearchBtn = document.getElementById('deep-search-btn');
        deepSearchBtn.disabled = true;
        deepSearchBtn.textContent = '🔍 正在启动...';

        try {
            const response = await fetch(`/api/products/${currentProductId}/deep-search`, {
                method: 'POST'
            });
            const data = await response.json();

            if (response.ok) {
                deepSearchBtn.textContent = '🔍 搜索中...';
                
                // 开始轮询深度搜索状态
                pollDeepSearchStatus(data.task_id, data.product_id, deepSearchBtn);
            } else {
                console.error('启动深度搜索失败:', data.error);
                alert('启动深度搜索失败: ' + data.error);
                deepSearchBtn.disabled = false;
                deepSearchBtn.textContent = '🔍 深度搜索相关推文';
            }
        } catch (error) {
            console.error('启动深度搜索时出错:', error);
            alert('网络错误，请重试');
            deepSearchBtn.disabled = false;
            deepSearchBtn.textContent = '🔍 深度搜索相关推文';
        }
    }

    // 轮询深度搜索状态
    async function pollDeepSearchStatus(taskId, productId, button) {
        const maxAttempts = 60; // 最多轮询5分钟
        let attempts = 0;

        const poll = async () => {
            attempts++;
            
            try {
                const response = await fetch(`/api/deep-search/${taskId}/status?product_id=${productId}`);
                const data = await response.json();

                if (response.ok) {
                    if (data.status === 'completed') {
                        button.textContent = `✅ 完成 (${data.posts_found}条推文)`;
                        button.disabled = false;
                        
                        // 刷新产品详情
                        await refreshProductPosts();
                        alert(`深度搜索完成！找到 ${data.posts_found} 条相关推文`);
                        
                    } else if (data.status === 'failed') {
                        button.textContent = '❌ 搜索失败';
                        button.disabled = false;
                        alert('深度搜索失败');
                        
                    } else if (data.status === 'running' && attempts < maxAttempts) {
                        button.textContent = `🔍 搜索中... (${attempts}/${maxAttempts})`;
                        setTimeout(poll, 5000); // 5秒后再次检查
                        
                    } else {
                        // 超时
                        button.textContent = '⏰ 搜索超时';
                        button.disabled = false;
                        alert('深度搜索超时，请稍后手动刷新查看结果');
                    }
                } else {
                    throw new Error(data.error || '检查状态失败');
                }
            } catch (error) {
                console.error('轮询深度搜索状态时出错:', error);
                if (attempts < maxAttempts) {
                    setTimeout(poll, 5000); // 出错时也继续重试
                } else {
                    button.textContent = '❌ 检查失败';
                    button.disabled = false;
                    alert('无法检查深度搜索状态，请稍后手动刷新');
                }
            }
        };

        // 开始轮询
        setTimeout(poll, 2000); // 2秒后开始第一次检查
    }

    // 刷新产品推文
    async function refreshProductPosts() {
        if (!currentProductId) return;

        refreshPostsBtn.disabled = true;
        refreshPostsBtn.textContent = '🔄 刷新中...';

        try {
            const response = await fetch(`/api/products/${currentProductId}`);
            const data = await response.json();

            if (response.ok) {
                renderProductDetail(data.product, data.posts);
                alert('数据已刷新');
            } else {
                console.error('刷新失败:', data.error);
                alert('刷新失败');
            }
        } catch (error) {
            console.error('刷新时出错:', error);
            alert('网络错误，请重试');
        } finally {
            refreshPostsBtn.disabled = false;
            refreshPostsBtn.textContent = '🔄 刷新数据';
        }
    }

    // 删除搜索记录
    async function deleteSearchRecord(searchId, keywords) {
        const keywordsText = Array.isArray(keywords) ? keywords.join(', ') : '未知';
        
        if (!confirm(`确定要删除搜索记录"${keywordsText}"吗？\n\n此操作将删除该搜索的所有产品和推文数据，且无法恢复。`)) {
            return;
        }

        try {
            const response = await fetch(`/api/search-records/${searchId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (response.ok) {
                alert('搜索记录已删除');
                // 重新加载搜索记录列表
                loadSearchRecords();
            } else {
                console.error('删除搜索记录失败:', data.error);
                alert('删除失败: ' + data.error);
            }
        } catch (error) {
            console.error('删除搜索记录时出错:', error);
            alert('网络错误，请重试');
        }
    }

    // 显示搜索列表
    function showSearchList() {
        productDetail.classList.add('hidden');
        document.querySelector('.search-history').classList.remove('hidden');
        currentProductId = null;
    }
});