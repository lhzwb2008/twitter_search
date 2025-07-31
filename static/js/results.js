// Results page JavaScript logic
document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const searchList = document.getElementById('search-list');
    const productDetail = document.getElementById('product-detail');
    const statusFilter = document.getElementById('status-filter');
    const keywordFilter = document.getElementById('keyword-filter');
    const backToListBtn = document.getElementById('back-to-list');
    const refreshPostsBtn = document.getElementById('refresh-posts');

    let currentProductId = null;
    let autoRefreshInterval = null;

    // Initialize
    loadSearchRecords();
    
    // Check if there's a product ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('product');
    if (productId) {
        // Direct show product detail
        showProductDetail(parseInt(productId));
    } else {
        // Start auto refresh (every 30 seconds)
        startAutoRefresh();
    }

    // Event listeners
    statusFilter.addEventListener('change', loadSearchRecords);
    keywordFilter.addEventListener('input', debounce(loadSearchRecords, 500));
    backToListBtn.addEventListener('click', showSearchList);
    refreshPostsBtn.addEventListener('click', refreshProductPosts);

    // Debounce function
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

    // Load search records
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
                console.error('Failed to load search records:', data.error);
                searchList.innerHTML = '<div class="no-results">Failed to load search records</div>';
            }
        } catch (error) {
            console.error('Error loading search records:', error);
            searchList.innerHTML = '<div class="no-results">Network error, please try again</div>';
        }
    }

    // Render search records
    function renderSearchRecords(records) {
        if (records.length === 0) {
            searchList.innerHTML = '<div class="no-results">No search records found</div>';
            return;
        }

        searchList.innerHTML = '';
        records.forEach(record => {
            const recordElement = createSearchRecordElement(record);
            searchList.appendChild(recordElement);
        });
        
        // 移除自动滚动，让用户自然浏览内容
    }

    // Create search record element
    function createSearchRecordElement(record) {
        const template = document.getElementById('search-record-template');
        const element = template.content.cloneNode(true);

        // Fill data
        const keywordsText = Array.isArray(record.keywords) && record.keywords.length > 0 
            ? record.keywords.join(', ') 
            : 'AI产品搜索'; // 为空关键词提供默认显示文本
        element.querySelector('.record-keywords').textContent = keywordsText;
        
        const dateRange = `${record.start_date} to ${record.end_date}`;
        element.querySelector('.record-date').textContent = dateRange;
        
        const statusElement = element.querySelector('.record-status');
        statusElement.textContent = getStatusText(record.status);
        statusElement.className = `record-status ${record.status}`;
        
        element.querySelector('.record-count').textContent = `${record.total_products} products`;

        // Bind view products event
        const viewBtn = element.querySelector('.view-products-btn');
        viewBtn.addEventListener('click', () => viewSearchProducts(record.id));

        // Bind delete event
        const deleteBtn = element.querySelector('.delete-record-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering other events
            deleteSearchRecord(record.id, record.keywords);
        });

        return element;
    }

    // Get status text
    function getStatusText(status) {
        const statusMap = {
            'pending': 'Pending',
            'running': 'Running',
            'completed': 'Completed',
            'failed': 'Failed'
        };
        return statusMap[status] || status;
    }

    // View search products
    async function viewSearchProducts(searchId) {
        try {
            const response = await fetch(`/api/search-records/${searchId}/products`);
            const data = await response.json();

            if (response.ok) {
                if (data.products.length > 0) {
                    // If only one product, show details directly
                    if (data.products.length === 1) {
                        showProductDetail(data.products[0].id);
                    } else {
                        // Show product list for selection
                        showProductSelection(data.products);
                    }
                } else {
                    alert('No product data found for this search');
                }
            } else {
                console.error('Failed to get product list:', data.error);
                alert('Failed to get product list');
            }
        } catch (error) {
            console.error('Error getting product list:', error);
            alert('Network error, please try again');
        }
    }

    // Show product selection interface (when multiple products)
    function showProductSelection(products) {
        // Create product selection modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Select Product to View</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="product-selection-list">
                        ${products.map(product => `
                            <div class="product-selection-item" data-product-id="${product.id}">
                                <div class="product-info">
                                    <h4>${product.name}</h4>
                                    <p>${product.description || 'No description'}</p>
                                    <div class="product-metrics">
                                        <span>👍 ${product.total_likes}</span>
                                        <span>🔄 ${product.total_retweets}</span>
                                        <span>💬 ${product.total_replies}</span>
                                    </div>
                                </div>
                                <button class="view-detail-btn">View Details</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Bind events
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

    // Show product details
    async function showProductDetail(productId) {
        try {
            currentProductId = productId;
            
            const response = await fetch(`/api/products/${productId}`);
            const data = await response.json();

            if (response.ok) {
                renderProductDetail(data.product, data.posts);
                
                // Switch to detail view
                document.querySelector('.search-history').classList.add('hidden');
                productDetail.classList.remove('hidden');
                
                // Stop auto refresh
                stopAutoRefresh();
            } else {
                console.error('Failed to get product details:', data.error);
                alert('Failed to get product details');
            }
        } catch (error) {
            console.error('Error getting product details:', error);
            alert('Network error, please try again');
        }
    }

    // Render product details
    function renderProductDetail(product, posts) {
        // Update search information
        if (product.search_info) {
            const searchInfo = product.search_info;
            document.getElementById('search-keywords').textContent = searchInfo.keywords.join(', ');
            document.getElementById('search-date-range').textContent = `${searchInfo.start_date} to ${searchInfo.end_date}`;
            document.getElementById('search-categories').textContent = searchInfo.categories.join(', ');
            document.getElementById('search-task-id').textContent = searchInfo.task_id;
        }
        
        // Update product basic information
        document.getElementById('product-name').textContent = product.name;
        document.getElementById('detail-name').textContent = product.name;
        document.getElementById('detail-category').textContent = product.category || 'Uncategorized';
        document.getElementById('detail-description').textContent = product.description || 'No description';
        
        const urlElement = document.getElementById('detail-url');
        if (product.official_url) {
            urlElement.href = product.official_url;
            urlElement.style.display = 'inline';
        } else {
            urlElement.style.display = 'none';
        }

        // Update social data summary
        document.getElementById('total-posts').textContent = product.total_posts || 0;
        document.getElementById('total-likes').textContent = product.total_likes || 0;
        document.getElementById('total-retweets').textContent = product.total_retweets || 0;
        document.getElementById('total-replies').textContent = product.total_replies || 0;
        document.getElementById('total-views').textContent = product.total_views || 0;

                // Render posts list
        renderPosts(posts);
        
        // Show deep search button (if not completed)
        if (!product.deep_search_completed) {
            showDeepSearchOption();
        }
    }

    // Render posts list
    function renderPosts(posts) {
        const postsList = document.getElementById('posts-list');
        
        if (posts.length === 0) {
            postsList.innerHTML = '<div class="no-results">No related posts found</div>';
            return;
        }

        postsList.innerHTML = '';
        posts.forEach(post => {
            const postElement = createPostElement(post);
            postsList.appendChild(postElement);
        });
    }

    // Create post element
    function createPostElement(post) {
        const template = document.getElementById('post-template');
        const element = template.content.cloneNode(true);

        // Fill data
        element.querySelector('.post-author').textContent = post.author || 'Unknown User';
        element.querySelector('.post-date').textContent = post.post_date ? 
            new Date(post.post_date).toLocaleString() : 'Unknown Time';
        element.querySelector('.post-content').textContent = post.content || 'No Content';
        
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

        // Mark original post
        if (post.is_original) {
            element.querySelector('.post-item').classList.add('original-post');
        }

        return element;
    }

    // Show deep search options
    function showDeepSearchOption() {
        const existingBtn = document.getElementById('deep-search-btn');
        if (existingBtn) return; // Avoid duplicate addition

        const deepSearchBtn = document.createElement('button');
        deepSearchBtn.id = 'deep-search-btn';
        deepSearchBtn.className = 'primary';
        deepSearchBtn.textContent = '🔍 Deep Search Related Posts';
        deepSearchBtn.style.marginLeft = '1rem';

        deepSearchBtn.addEventListener('click', triggerDeepSearch);

        document.querySelector('.section-header').appendChild(deepSearchBtn);
    }

    // Trigger deep search
    async function triggerDeepSearch() {
        if (!currentProductId) return;

        const deepSearchBtn = document.getElementById('deep-search-btn');
        deepSearchBtn.disabled = true;
        deepSearchBtn.textContent = '🔍 Starting...';

        try {
            const response = await fetch(`/api/products/${currentProductId}/deep-search`, {
                method: 'POST'
            });
            const data = await response.json();

            if (response.ok) {
                deepSearchBtn.textContent = '🔍 Searching...';
                
                // Start polling deep search status
                pollDeepSearchStatus(data.task_id, data.product_id, deepSearchBtn);
            } else {
                console.error('Failed to start deep search:', data.error);
                alert('Failed to start deep search: ' + data.error);
                deepSearchBtn.disabled = false;
                deepSearchBtn.textContent = '🔍 Deep Search Related Posts';
            }
        } catch (error) {
            console.error('Error starting deep search:', error);
            alert('Network error, please try again');
            deepSearchBtn.disabled = false;
            deepSearchBtn.textContent = '🔍 Deep Search Related Posts';
        }
    }

    // Poll deep search status
    async function pollDeepSearchStatus(taskId, productId, button) {
        const maxAttempts = 60; // Maximum 5 minutes polling
        let attempts = 0;

        const poll = async () => {
            attempts++;
            
            try {
                const response = await fetch(`/api/deep-search/${taskId}/status?product_id=${productId}`);
                const data = await response.json();

                if (response.ok) {
                    if (data.status === 'completed') {
                        button.textContent = `✅ Completed (${data.posts_found} posts)`;
                        button.disabled = false;
                        
                        // Refresh product details
                        await refreshProductPosts();
                        alert(`Deep search completed! Found ${data.posts_found} related posts`);
                        
                    } else if (data.status === 'failed') {
                        button.textContent = '❌ Search Failed';
                        button.disabled = false;
                        alert('Deep search failed');
                        
                    } else if (data.status === 'running' && attempts < maxAttempts) {
                        button.textContent = `🔍 Searching... (${attempts}/${maxAttempts})`;
                        setTimeout(poll, 5000); // Check again after 5 seconds
                        
                    } else {
                        // Timeout
                        button.textContent = '⏰ Search Timeout';
                        button.disabled = false;
                        alert('Deep search timeout, please manually refresh later to check results');
                    }
                } else {
                    throw new Error(data.error || 'Status check failed');
                }
            } catch (error) {
                console.error('Error polling deep search status:', error);
                if (attempts < maxAttempts) {
                    setTimeout(poll, 5000); // Continue retry even on error
                } else {
                    button.textContent = '❌ Check Failed';
                    button.disabled = false;
                    alert('Unable to check deep search status, please manually refresh later');
                }
            }
        };

        // 开始轮询
        setTimeout(poll, 2000); // Start first check after 2 seconds
    }

    // 刷新产品推文
    async function refreshProductPosts() {
        if (!currentProductId) return;

        refreshPostsBtn.disabled = true;
        refreshPostsBtn.textContent = '🔄 Refreshing...';

        try {
            const response = await fetch(`/api/products/${currentProductId}`);
            const data = await response.json();

            if (response.ok) {
                renderProductDetail(data.product, data.posts);
                alert('Data refreshed');
            } else {
                console.error('Refresh failed:', data.error);
                alert('Refresh failed');
            }
        } catch (error) {
            console.error('Error during refresh:', error);
            alert('Network error, please try again');
        } finally {
            refreshPostsBtn.disabled = false;
            refreshPostsBtn.textContent = '🔄 Refresh Data';
        }
    }

    // 删除搜索记录
    async function deleteSearchRecord(searchId, keywords) {
        const keywordsText = Array.isArray(keywords) && keywords.length > 0 
            ? keywords.join(', ') 
            : 'AI产品搜索';
        
        if (!confirm(`Are you sure you want to delete the search record "${keywordsText}"?\n\nThis operation will delete all product and post data for this search and cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/search-records/${searchId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (response.ok) {
                alert('Search record deleted');
                // Reload search records list
                loadSearchRecords();
            } else {
                console.error('Failed to delete search record:', data.error);
                alert('Delete failed: ' + data.error);
            }
        } catch (error) {
            console.error('Error deleting search record:', error);
            alert('Network error, please try again');
        }
    }

    // 显示搜索列表
    function showSearchList() {
        productDetail.classList.add('hidden');
        document.querySelector('.search-history').classList.remove('hidden');
        currentProductId = null;
        
        // Restart auto refresh
        startAutoRefresh();
    }
    
    // 启动自动刷新
    function startAutoRefresh() {
        // 清除现有的刷新间隔
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        
        // Set new refresh interval (refresh every 30 seconds)
        autoRefreshInterval = setInterval(() => {
            // Only refresh on search list page
            if (!productDetail.classList.contains('hidden')) {
                return; // Don't refresh if on product detail page
            }
            
            console.log('[DEBUG] Auto refresh search records list');
            loadSearchRecords();
        }, 30000); // 30 seconds
    }
    
    // 停止自动刷新
    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }
    
    // 页面隐藏时停止刷新，显示时恢复刷新
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopAutoRefresh();
        } else {
            // When page becomes visible again, restart refresh if on search list page
            if (productDetail.classList.contains('hidden')) {
                startAutoRefresh();
            }
        }
    });
});