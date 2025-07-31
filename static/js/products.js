/**
 * Products页面交互逻辑
 */

class ProductsManager {
    constructor() {
        this.currentMonth = null;
        this.months = [];
        this.products = [];
        
        this.initializeElements();
        this.bindEvents();
        this.loadMonths();
    }
    
    initializeElements() {
        this.monthsList = document.getElementById('months-list');
        this.productsContainer = document.getElementById('products-container');
        this.currentMonthTitle = document.getElementById('current-month-title');
        this.productsCount = document.getElementById('products-count');
        this.loadingProducts = document.getElementById('loading-products');
        
        // 模板
        this.monthItemTemplate = document.getElementById('month-item-template');
        this.productCardTemplate = document.getElementById('product-card-template');
    }
    
    bindEvents() {
        // 月份点击事件委托
        this.monthsList.addEventListener('click', (e) => {
            const monthItem = e.target.closest('.month-item');
            if (monthItem) {
                const month = monthItem.dataset.month;
                this.selectMonth(month);
            }
        });
    }
    
    async loadMonths() {
        try {
            this.showLoadingMonths();
            
            const response = await fetch('/api/months');
            const data = await response.json();
            
            if (response.ok) {
                this.months = data.months;
                this.renderMonths();
                
                // 如果有月份数据，自动选择第一个月份
                if (this.months.length > 0) {
                    this.selectMonth(this.months[0].month);
                }
            } else {
                this.showError('Failed to load months list: ' + data.error);
            }
        } catch (error) {
            console.error('Failed to load months:', error);
            this.showError('Error occurred while loading months list');
        }
    }
    
    showLoadingMonths() {
        this.monthsList.innerHTML = '<div class="loading-months">Loading months...</div>';
    }
    
    renderMonths() {
        if (this.months.length === 0) {
            this.monthsList.innerHTML = `
                <div class="empty-months">
                    <div class="empty-icon">📅</div>
                    <p>No search records found</p>
                    <p>Please perform some searches first</p>
                </div>
            `;
            return;
        }
        
        this.monthsList.innerHTML = '';
        
        this.months.forEach(month => {
            const monthElement = this.createMonthElement(month);
            this.monthsList.appendChild(monthElement);
        });
    }
    
    createMonthElement(month) {
        const template = this.monthItemTemplate.content.cloneNode(true);
        const monthItem = template.querySelector('.month-item');
        
        monthItem.dataset.month = month.month;
        
        const monthName = template.querySelector('.month-name');
        const productCount = template.querySelector('.product-count');
        const searchCount = template.querySelector('.search-count');
        
        // 格式化月份显示
        const [year, monthNum] = month.month_display.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIndex = parseInt(monthNum) - 1;
        const monthName_formatted = `${monthNames[monthIndex]} ${year}`;
        
        monthName.textContent = monthName_formatted;
        productCount.textContent = `${month.product_count} products`;
        searchCount.textContent = `${month.search_count} searches`;
        
        return template;
    }
    
    async selectMonth(month) {
        if (this.currentMonth === month) return;
        
        // 更新选中状态
        this.updateMonthSelection(month);
        this.currentMonth = month;
        
        // 加载该月份的产品
        await this.loadProductsForMonth(month);
    }
    
    updateMonthSelection(selectedMonth) {
        // 移除所有选中状态
        this.monthsList.querySelectorAll('.month-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 添加选中状态
        const selectedItem = this.monthsList.querySelector(`[data-month="${selectedMonth}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }
    
    async loadProductsForMonth(month) {
        try {
            this.showLoadingProducts();
            
            const response = await fetch(`/api/months/${month}/products`);
            const data = await response.json();
            
            if (response.ok) {
                this.products = data.products;
                this.renderProducts(data);
            } else {
                this.showError('Failed to load products: ' + data.error);
            }
        } catch (error) {
            console.error('Failed to load products:', error);
            this.showError('Error occurred while loading products');
        } finally {
            this.hideLoadingProducts();
        }
    }
    
    showLoadingProducts() {
        this.loadingProducts.classList.remove('hidden');
        this.productsContainer.classList.add('hidden');
    }
    
    hideLoadingProducts() {
        this.loadingProducts.classList.add('hidden');
        this.productsContainer.classList.remove('hidden');
        
        // 确保滚动位置在顶部，防止自动滚动到底部
        setTimeout(() => {
            this.productsContainer.scrollTop = 0;
        }, 50);
    }
    
    renderProducts(data) {
        // 更新标题和统计
        const monthDisplay = data.month_display;
        this.currentMonthTitle.textContent = `Products from ${monthDisplay}`;
        this.productsCount.textContent = `${data.total_count} products`;
        
        if (data.products.length === 0) {
            this.productsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h4>No Products Found</h4>
                    <p>No products were discovered in ${monthDisplay}.</p>
                </div>
            `;
            return;
        }
        
        // 渲染产品网格
        this.productsContainer.innerHTML = '<div class="products-grid"></div>';
        const productsGrid = this.productsContainer.querySelector('.products-grid');
        
        data.products.forEach(product => {
            const productElement = this.createProductElement(product);
            productsGrid.appendChild(productElement);
        });
    }
    
    createProductElement(product) {
        const template = this.productCardTemplate.content.cloneNode(true);
        
        // 基本信息
        const productName = template.querySelector('.product-name');
        const productCategory = template.querySelector('.product-category');
        const productDescription = template.querySelector('.product-description');
        
        productName.textContent = product.name;
        productCategory.textContent = product.category;
        productDescription.textContent = product.description;
        
        // 社交指标
        const likesCount = template.querySelector('.likes .count');
        const retweetsCount = template.querySelector('.retweets .count');
        const repliesCount = template.querySelector('.replies .count');
        
        likesCount.textContent = this.formatNumber(product.metrics.likes);
        retweetsCount.textContent = this.formatNumber(product.metrics.retweets);
        repliesCount.textContent = this.formatNumber(product.metrics.replies);
        
        // 链接
        const productUrl = template.querySelector('.product-url');
        const postUrl = template.querySelector('.post-url');
        const detailUrl = template.querySelector('.detail-url');
        
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
        
        // 详情页面链接
        detailUrl.href = `/results#product-${product.id}`;
        
        // 搜索日期信息
        const searchDate = template.querySelector('.search-date');
        if (product.search_info && product.search_info.start_date) {
            const date = new Date(product.search_info.start_date);
            searchDate.textContent = `Discovered: ${date.toLocaleDateString()}`;
        }
        
        return template;
    }
    
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    showError(message) {
        this.productsContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h4>Error</h4>
                <p>${message}</p>
                <button onclick="location.reload()" class="retry-btn">Retry</button>
            </div>
        `;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new ProductsManager();
    
    // 确保页面加载后滚动位置在顶部
    setTimeout(() => {
        window.scrollTo(0, 0);
        const productsContainer = document.getElementById('products-container');
        if (productsContainer) {
            productsContainer.scrollTop = 0;
        }
    }, 100);
}); 