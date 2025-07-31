#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI产品Twitter搜索Web应用
"""

from flask import Flask, render_template, request, jsonify
import json
import time
import requests
from datetime import datetime
import os
import re
import pymysql
from contextlib import contextmanager

app = Flask(__name__)

# 配置
API_KEY = os.environ.get('BROWSER_USE_API_KEY', 'bu_MBkDV8V3engHO_xepEZzvXQvpR8_GK78487Kkmef014')
MODEL = "claude-sonnet-4-20250514"

# MySQL数据库配置
MYSQL_CONFIG = {
    'host': 'sh-cdb-kgv8etuq.sql.tencentcdb.com',
    'port': 23333,
    'user': 'root',
    'password': 'Hello2025',
    'database': 'twitter_search',
    'charset': 'utf8mb4'
}

# 默认的搜索Prompt - 两阶段搜索版
DEFAULT_PROMPT = """You are an AI Product Discovery Expert. Your task is to perform a TWO-STAGE search to comprehensively discover AI products and their Twitter presence.

STAGE 1: PRODUCT DISCOVERY
Find AI-related products from Twitter mirror sites:

1. Primary Strategy - Try multiple Nitter instances:
   - https://nitter.privacyredirect.com/
   - https://nitter.net/
   - https://nitter.poast.org/
   - https://nitter.1d4.us/

2. Search Flexibility:
   - Start with date range: 2025-06-01 to 2025-07-01
   - If no results, expand to: 2025-05-01 to 2025-07-31
   - Try multiple queries:
     * "AI app" OR "AI tool" launch
     * "new AI" startup
     * "launched AI" product
     * "AI agent" OR "AI assistant"

3. For EACH product found, extract:
   - Product name
   - Brief description
   - Official website (if mentioned)
   - Category
   - The discovery post URL and metrics

STAGE 2: DEEP PRODUCT SEARCH
For EACH product discovered in Stage 1, perform additional searches:

1. Search queries for each product:
   - "[Product Name]"
   - "[Product Name] launch"
   - "[Product Name] review"
   - "[Product Name] demo"
   - "[Product Name] AI"

2. Collect ALL related posts for each product:
   - Original announcements
   - User reviews and feedback
   - Demos and tutorials
   - News coverage
   - Community discussions

3. For EACH post found:
   a) Click on the individual tweet to get specific post URL
   b) Extract exact URL (https://nitter.net/username/status/NUMBERS)
   c) Get real metrics from the individual post page
   d) Extract content, author, date

CRITICAL OUTPUT FORMAT:
Return ONLY a JSON object with comprehensive data:

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
        },
        {
          "post_url": "https://nitter.net/user2/status/456",
          "content": "Another post about the product",
          "author": "username2", 
          "post_date": "2024-01-02T15:30:00Z",
          "metrics": {"likes": 8, "retweets": 3, "replies": 1, "views": 75}
        }
      ]
    }
  ]
}

REQUIREMENTS:
- MUST find at least 3 products
- Each product MUST have multiple posts (aim for 3-10 posts per product)
- All post URLs must be specific individual posts, NOT search pages
- Extract real metrics from individual post pages
- If no official website found, set "url" to ""

Categories: 'Text Generation', 'Image Generation', 'Audio Generation', 'Video Generation', 'Productivity', 'Development', 'Other'

CRITICAL: Return ONLY the JSON object, no explanations."""

# 存储搜索结果的简单缓存
search_cache = {}

# 数据库连接管理
@contextmanager
def get_db_connection():
    """获取数据库连接的上下文管理器"""
    connection = None
    try:
        connection = pymysql.connect(**MYSQL_CONFIG)
        yield connection
    except Exception as e:
        print(f"数据库连接错误: {e}")
        if connection:
            connection.rollback()
        raise
    finally:
        if connection:
            connection.close()

def cleanup_stale_tasks():
    """清理长时间运行的失效任务"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 查找超过30分钟仍在运行的任务
                cursor.execute("""
                    UPDATE search_records 
                    SET status = 'failed' 
                    WHERE status = 'running' 
                    AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                """)
                
                updated_count = cursor.rowcount
                if updated_count > 0:
                    connection.commit()
                    print(f"清理了 {updated_count} 个长时间运行的失效任务")
                else:
                    print("没有发现需要清理的失效任务")
                    
    except Exception as e:
        print(f"清理失效任务失败: {e}")

def migrate_database():
    """迁移数据库，移除search_key的唯一约束"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 检查是否存在unique_search约束
                cursor.execute("""
                    SELECT CONSTRAINT_NAME 
                    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                    WHERE TABLE_SCHEMA = %s 
                    AND TABLE_NAME = 'search_records' 
                    AND CONSTRAINT_NAME = 'unique_search'
                """, (MYSQL_CONFIG['database'],))
                
                constraint_exists = cursor.fetchone()
                
                if constraint_exists:
                    print("正在移除search_key的唯一约束...")
                    # 移除唯一约束
                    cursor.execute("ALTER TABLE search_records DROP INDEX unique_search")
                    # 添加普通索引
                    cursor.execute("ALTER TABLE search_records ADD INDEX idx_search_key (search_key)")
                    connection.commit()
                    print("数据库迁移完成：已移除search_key唯一约束")
                else:
                    print("search_key唯一约束不存在，无需迁移")
                    
    except Exception as e:
        print(f"数据库迁移失败: {e}")

def init_database():
    """初始化数据库和表结构"""
    try:
        # 首先连接到MySQL服务器（不指定数据库）
        temp_config = MYSQL_CONFIG.copy()
        temp_config.pop('database')
        
        with pymysql.connect(**temp_config) as connection:
            with connection.cursor() as cursor:
                # 创建数据库（如果不存在）
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS {MYSQL_CONFIG['database']} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                print(f"数据库 {MYSQL_CONFIG['database']} 创建成功或已存在")
        
        # 连接到指定数据库并创建表
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 创建分类设置表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS category_settings (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id VARCHAR(50) DEFAULT 'default' COMMENT '用户ID，暂时使用default',
                        preset_categories JSON NOT NULL COMMENT '预设分类设置',
                        custom_categories JSON NOT NULL COMMENT '自定义分类设置',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_user (user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                # 创建搜索记录表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS search_records (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        search_key VARCHAR(255) NOT NULL COMMENT '搜索唯一标识：关键词+时间范围的hash',
                        keywords JSON NOT NULL COMMENT '搜索关键词列表',
                        start_date DATE NOT NULL COMMENT '搜索开始日期',
                        end_date DATE NOT NULL COMMENT '搜索结束日期',
                        categories JSON NOT NULL COMMENT '搜索的分类列表',
                        task_id VARCHAR(100) COMMENT 'Browser-use任务ID',
                        status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending' COMMENT '搜索状态',
                        total_products INT DEFAULT 0 COMMENT '找到的产品总数',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_search_key (search_key),
                        INDEX idx_date_range (start_date, end_date),
                        INDEX idx_status (status)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                # 创建产品表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS products (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        search_id INT NOT NULL COMMENT '关联的搜索记录ID',
                        name VARCHAR(255) NOT NULL COMMENT '产品名称',
                        description TEXT COMMENT '产品描述',
                        category VARCHAR(100) COMMENT '产品分类',
                        official_url VARCHAR(500) COMMENT '产品官方网站',
                        first_post_url VARCHAR(500) COMMENT '首次发现的推文链接',
                        deep_search_completed BOOLEAN DEFAULT FALSE COMMENT '是否已完成深度搜索',
                        total_likes INT DEFAULT 0 COMMENT '总点赞数',
                        total_retweets INT DEFAULT 0 COMMENT '总转发数',
                        total_replies INT DEFAULT 0 COMMENT '总回复数',
                        total_views INT DEFAULT 0 COMMENT '总浏览数',
                        total_posts INT DEFAULT 1 COMMENT '相关推文总数',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (search_id) REFERENCES search_records(id) ON DELETE CASCADE,
                        INDEX idx_search_id (search_id),
                        INDEX idx_name (name),
                        INDEX idx_category (category)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                # 创建推文表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS posts (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        product_id INT NOT NULL COMMENT '关联的产品ID',
                        post_url VARCHAR(500) NOT NULL COMMENT '推文链接',
                        content TEXT COMMENT '推文内容',
                        author VARCHAR(100) COMMENT '作者用户名',
                        post_date DATETIME COMMENT '发布时间',
                        likes INT DEFAULT 0 COMMENT '点赞数',
                        retweets INT DEFAULT 0 COMMENT '转发数',
                        replies INT DEFAULT 0 COMMENT '回复数',
                        views INT DEFAULT 0 COMMENT '浏览数',
                        is_original BOOLEAN DEFAULT FALSE COMMENT '是否为原始发现的推文',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                        UNIQUE KEY unique_post (product_id, post_url),
                        INDEX idx_product_id (product_id),
                        INDEX idx_post_date (post_date),
                        INDEX idx_metrics (likes, retweets, replies, views)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                # 检查是否已有默认分类设置，如果没有则插入
                cursor.execute("SELECT COUNT(*) FROM category_settings WHERE user_id = 'default'")
                count = cursor.fetchone()[0]
                
                if count == 0:
                    # 插入默认分类设置
                    default_preset = [
                        {'value': 'Text Generation', 'label': '文本生成', 'enabled': True},
                        {'value': 'Image Generation', 'label': '图像生成', 'enabled': True},
                        {'value': 'Video Generation', 'label': '视频生成', 'enabled': False},
                        {'value': 'Audio Generation', 'label': '音频生成', 'enabled': False},
                        {'value': 'Productivity', 'label': '生产力工具', 'enabled': True},
                        {'value': 'Development', 'label': '开发工具', 'enabled': True},
                        {'value': 'Entertainment', 'label': '娱乐应用', 'enabled': False},
                        {'value': 'Education', 'label': '教育学习', 'enabled': False},
                        {'value': 'Business', 'label': '商业应用', 'enabled': False},
                        {'value': 'Healthcare', 'label': '医疗健康', 'enabled': False},
                        {'value': 'Design', 'label': '设计工具', 'enabled': False},
                        {'value': 'Other', 'label': '其他', 'enabled': False}
                    ]
                    
                    cursor.execute("""
                        INSERT INTO category_settings (user_id, preset_categories, custom_categories)
                        VALUES ('default', %s, %s)
                    """, (json.dumps(default_preset), json.dumps([])))
                    
                    print("默认分类设置插入成功")
                
                connection.commit()
                print("数据库表初始化完成")
                
    except Exception as e:
        print(f"数据库初始化失败: {e}")
        raise

def load_category_settings(user_id='default'):
    """从数据库加载分类设置"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT preset_categories, custom_categories 
                    FROM category_settings 
                    WHERE user_id = %s
                """, (user_id,))
                
                result = cursor.fetchone()
                if result:
                    preset_categories = json.loads(result[0]) if result[0] else []
                    custom_categories = json.loads(result[1]) if result[1] else []
                    return {
                        'preset': preset_categories,
                        'custom': custom_categories
                    }
                else:
                    # 如果没有找到，返回默认设置
                    return get_default_category_settings()
    except Exception as e:
        print(f"Failed to load category settings: {e}")
        return get_default_category_settings()

def save_category_settings(settings, user_id='default'):
    """保存分类设置到数据库"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO category_settings (user_id, preset_categories, custom_categories)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    preset_categories = VALUES(preset_categories),
                    custom_categories = VALUES(custom_categories),
                    updated_at = CURRENT_TIMESTAMP
                """, (
                    user_id,
                    json.dumps(settings.get('preset', [])),
                    json.dumps(settings.get('custom', []))
                ))
                connection.commit()
                return True
    except Exception as e:
        print(f"保存分类设置失败: {e}")
        return False

def get_default_category_settings():
    """获取默认分类设置"""
    return {
        'preset': [
            {'value': 'Text Generation', 'label': 'Text Generation', 'enabled': True},
            {'value': 'Image Generation', 'label': 'Image Generation', 'enabled': True},
            {'value': 'Video Generation', 'label': 'Video Generation', 'enabled': False},
            {'value': 'Audio Generation', 'label': 'Audio Generation', 'enabled': False},
            {'value': 'Productivity', 'label': 'Productivity', 'enabled': True},
            {'value': 'Development', 'label': 'Development', 'enabled': True},
            {'value': 'Entertainment', 'label': 'Entertainment', 'enabled': False},
            {'value': 'Education', 'label': 'Education', 'enabled': False},
            {'value': 'Business', 'label': 'Business', 'enabled': False},
            {'value': 'Healthcare', 'label': 'Healthcare', 'enabled': False},
            {'value': 'Design', 'label': 'Design', 'enabled': False},
            {'value': 'Other', 'label': 'Other', 'enabled': False}
        ],
        'custom': []
    }

def save_search_results(task_id, status, products_data):
    """保存搜索结果到数据库，支持从失败任务中恢复的数据"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 查找对应的搜索记录
                cursor.execute("SELECT id FROM search_records WHERE task_id = %s", (task_id,))
                search_record = cursor.fetchone()
                
                if not search_record:
                    print(f"[DEBUG] 未找到task_id为{task_id}的搜索记录")
                    # 查看数据库中所有的task_id，用于调试
                    cursor.execute("SELECT task_id, status, created_at FROM search_records ORDER BY created_at DESC LIMIT 5")
                    all_records = cursor.fetchall()
                    print(f"[DEBUG] 数据库中最近的搜索记录:")
                    for record in all_records:
                        print(f"[DEBUG] - task_id: {record[0]}, status: {record[1]}, created_at: {record[2]}")
                    
                    # 尝试创建一个搜索记录（如果完全没有的话）
                    print(f"[DEBUG] 尝试为task_id {task_id} 创建搜索记录")
                    try:
                        cursor.execute("""
                            INSERT INTO search_records (task_id, search_key, keywords, start_date, end_date, categories, status, total_products)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (task_id, f"auto_{task_id}", json.dumps(["AI app"]), "2025-06-01", "2025-07-01", json.dumps(["Productivity"]), 'running', 0))
                        connection.commit()
                        print(f"[DEBUG] 成功创建搜索记录")
                        
                        # 重新查询
                        cursor.execute("SELECT id FROM search_records WHERE task_id = %s", (task_id,))
                        search_record = cursor.fetchone()
                    except Exception as e:
                        print(f"[DEBUG] 创建搜索记录失败: {e}")
                        return
                
                if not search_record:
                    print(f"[DEBUG] 仍然无法找到或创建搜索记录")
                    return
                
                search_id = search_record[0]
                products = products_data.get('products', [])
                
                # 检查是否是从日志恢复的数据
                is_recovered = products_data.get('recovered_from_logs', False)
                
                # 更新搜索记录状态
                if is_recovered:
                    # 如果是从日志恢复的，标记为部分完成
                    final_status = 'completed' if products else 'failed'
                    note = f"任务中断，但成功从执行日志恢复了{len(products)}个产品"
                else:
                    final_status = 'completed' if status == 'finished' else 'failed'
                    note = ""
                
                cursor.execute("""
                    UPDATE search_records 
                    SET status = %s, total_products = %s 
                    WHERE id = %s
                """, (final_status, len(products), search_id))
                
                # 保存产品数据
                if products:
                    saved_products = set()  # 用于去重
                    for product in products:
                        product_name = product.get('name', '').strip()
                        if not product_name or product_name in saved_products:
                            continue  # 跳过空名称或重复产品
                        
                        saved_products.add(product_name)
                        
                        # 检查该搜索中是否已存在同名产品
                        cursor.execute("""
                            SELECT id FROM products 
                            WHERE search_id = %s AND name = %s
                        """, (search_id, product_name))
                        
                        existing_product = cursor.fetchone()
                        if existing_product:
                            print(f"[DEBUG] 产品 '{product_name}' 已存在，跳过")
                            continue
                        
                        # 处理新格式和旧格式的兼容性
                        discovery_post = product.get('discovery_post', {})
                        all_posts = product.get('all_posts', [])
                        
                        # 如果是旧格式或日志恢复格式，转换为新格式
                        if not discovery_post and not all_posts:
                            # 旧格式或日志恢复格式兼容
                            discovery_post = {
                                'post_url': product.get('post_url', ''),
                                'metrics': product.get('metrics', {})
                            }
                            all_posts = [{
                                'post_url': product.get('post_url', ''),
                                'content': product.get('description', ''),
                                'author': '',
                                'post_date': None,
                                'metrics': product.get('metrics', {})
                            }]
                        
                        # 计算汇总的社交数据
                        total_likes = 0
                        total_retweets = 0
                        total_replies = 0
                        total_views = 0
                        total_posts = len(all_posts)
                        
                        for post in all_posts:
                            metrics = post.get('metrics', {})
                            total_likes += metrics.get('likes', 0) or 0
                            total_retweets += metrics.get('retweets', 0) or 0
                            total_replies += metrics.get('replies', 0) or 0
                            total_views += metrics.get('views', 0) or 0
                        
                        # 插入产品记录
                        cursor.execute("""
                            INSERT INTO products (
                                search_id, name, description, category, 
                                official_url, first_post_url, total_likes, 
                                total_retweets, total_replies, total_views, total_posts,
                                deep_search_completed
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            search_id,
                            product_name,
                            product.get('description', ''),
                            product.get('category', ''),
                            product.get('url', ''),
                            discovery_post.get('post_url', ''),
                            total_likes,
                            total_retweets,
                            total_replies,
                            total_views,
                            total_posts,
                            True if all_posts else False  # 如果有多个推文，标记为已完成深度搜索
                        ))
                        
                        product_id = cursor.lastrowid
                        print(f"[DEBUG] 插入产品 '{product_name}'，ID: {product_id}，推文数: {total_posts}")
                        
                        # 插入所有相关推文
                        for i, post in enumerate(all_posts):
                            post_url = post.get('post_url', '').strip()
                            if post_url and not post_url.endswith('/search?'):
                                try:
                                    # 处理日期格式
                                    post_date = post.get('post_date')
                                    if post_date and isinstance(post_date, str):
                                        # 尝试解析各种日期格式
                                        try:
                                            from datetime import datetime
                                            if 'Jun 30, 2025' in post_date:
                                                post_date = '2025-06-30'
                                            elif 'Jul' in post_date and '2025' in post_date:
                                                post_date = '2025-07-01'
                                            else:
                                                post_date = None
                                        except:
                                            post_date = None
                                    
                                    cursor.execute("""
                                        INSERT INTO posts (
                                            product_id, post_url, content, author, post_date,
                                            likes, retweets, replies, views, is_original
                                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    """, (
                                        product_id,
                                        post_url,
                                        post.get('content', product.get('description', '')),
                                        post.get('author', ''),
                                        post_date,
                                        post.get('metrics', {}).get('likes', 0),
                                        post.get('metrics', {}).get('retweets', 0),
                                        post.get('metrics', {}).get('replies', 0),
                                        post.get('metrics', {}).get('views', 0),
                                        i == 0  # 第一个推文标记为原始发现推文
                                    ))
                                except Exception as e:
                                    print(f"[DEBUG] 插入推文失败: {e}")
                                    continue
                
                connection.commit()
                if is_recovered:
                    print(f"[DEBUG] 成功从日志恢复并保存{len(products)}个产品到数据库")
                else:
                    print(f"[DEBUG] 成功保存{len(products)}个产品到数据库")
                
    except Exception as e:
        print(f"[DEBUG] 保存搜索结果时出错: {e}")
        raise

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/results')
def results():
    """结果展示页面"""
    return render_template('results.html')

@app.route('/products')
def products():
    """按月份分类的产品展示页面"""
    return render_template('products.html')

@app.route('/api/search', methods=['POST'])
def search():
    """启动搜索任务"""
    try:
        data = request.get_json()
        
        # 修复：从 search_params 中提取参数
        search_params = data.get('search_params', {})
        start_date = search_params.get('start_date', '2025-06-01')
        end_date = search_params.get('end_date', '2025-07-01')
        keywords_raw = search_params.get('keywords', [])
        # 确保关键词不为空，如果为空则使用默认值
        keywords = keywords_raw if keywords_raw and len(keywords_raw) > 0 else ['AI app']
        categories = search_params.get('categories', [])
        
        # 构建关键词字符串
        keyword_str = ' OR '.join([f'"{kw}"' for kw in keywords]) if keywords else '"AI app"'
        
        # 构建分类条件
        category_str = ', '.join(categories) if categories else 'Text Generation, Image Generation, Video Generation, Audio Generation, Code Generation, Data Analysis, Chatbot, Productivity Tools, Development Tools, Design Tools'
        
        # 使用传入的 prompt 或构建默认 prompt
        prompt = data.get('prompt') or f"""
You are a professional AI Product Discovery Expert. Search and discover AI products, applications, and tools on Twitter/X.

**Search Requirements:**
- Time range: {start_date} to {end_date}
- Main keywords: {keyword_str}
- Target categories: {category_str}
- Find at least: 3 products

**Output Format:**
Return results in JSON format with products array containing name, description, url, category, discovery_post and all_posts.

Start searching!
"""

        # 调用browser-use API
        task_response = create_browser_task(prompt)
        
        if task_response and 'id' in task_response:
            task_id = task_response['id']
            
            # 创建搜索记录
            try:
                import hashlib
                import time
                # 使用时间戳确保每次搜索都有唯一的search_key
                timestamp = str(int(time.time() * 1000))  # 毫秒级时间戳
                search_key = hashlib.md5(f"{keyword_str}_{start_date}_{end_date}_{timestamp}".encode()).hexdigest()
                
                print(f"[DEBUG] 准备创建搜索记录，task_id: {task_id}, search_key: {search_key}")
                
                with get_db_connection() as connection:
                    with connection.cursor() as cursor:
                        # 直接创建新的搜索记录，不再检查重复
                        cursor.execute("""
                            INSERT INTO search_records (task_id, search_key, keywords, start_date, end_date, categories, status, total_products)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (task_id, search_key, json.dumps(keywords), start_date, end_date, json.dumps(categories), 'running', 0))
                        connection.commit()
                        print(f"[DEBUG] 创建新搜索记录成功，task_id: {task_id}")
            except Exception as e:
                print(f"[DEBUG] 创建搜索记录失败: {e}")
                # 即使数据库记录创建失败，也继续返回task_id，因为browser-use任务已经启动
            
            return jsonify({
                'task_id': task_id,
                'live_url': task_response.get('live_url'),
                'status': 'started'
            })
        else:
            return jsonify({'error': '启动搜索任务失败'}), 500
            
    except Exception as e:
        print(f"搜索错误: {str(e)}")
        return jsonify({'error': f'搜索失败: {str(e)}'}), 500

@app.route('/api/task/<task_id>/status', methods=['GET'])
def task_status(task_id):
    """获取任务状态，返回browser-use的原始输出内容"""
    status = get_task_status_from_api(task_id)
    
    print(f"[DEBUG] 任务 {task_id} 状态: {status}")
    
    # 获取任务详情
    result = get_task_detail_from_api(task_id)
    
    # 如果任务完成、失败或停止，返回原始输出内容
    if status in ['finished', 'failed', 'stopped']:
        print(f"[DEBUG] 任务已结束，返回原始输出内容")
        
        # 获取输出文件内容
        output_files_content = {}
        if result.get('output_files'):
            for filename in result['output_files']:
                if filename and filename.strip():
                    file_content = get_output_file_content(task_id, filename)
                    if file_content:
                        output_files_content[filename] = file_content
                        print(f"[DEBUG] 成功获取文件 {filename} 的内容")
                    else:
                        output_files_content[filename] = f"File '{filename}' not found on server"
                        print(f"[DEBUG] 无法获取文件 {filename} 的内容")
        
        # 尝试解析产品数据（如果有JSON结果的话）
        products_data = None
        execution_error = None
        try:
            products_data = parse_task_result(result)
            products_count = len(products_data.get('products', []))
            if products_count > 0:
                print(f"[DEBUG] 成功解析出 {products_count} 个产品")
                # 保存到数据库
                save_search_results(task_id, status, products_data)
            else:
                # 检查是否是执行中断的情况
                execution_error = detect_execution_issues(result)
                if execution_error:
                    print(f"[DEBUG] 检测到执行问题: {execution_error}")
        except Exception as e:
            print(f"[DEBUG] 解析产品数据失败: {e}")
            execution_error = f"数据解析失败: {str(e)}"
        
        # 返回完整的原始输出内容
        response_data = {
            'status': status,
            'live_url': result.get('live_url', ''),
            'raw_output': result.get('output', ''),  # 原始输出文本
            'output_files': result.get('output_files', []),  # 输出文件列表
            'output_files_content': output_files_content,  # 输出文件内容
            'steps': result.get('steps', []),  # 执行步骤
            'browser_data': result.get('browser_data', {}),  # 浏览器数据
            'metadata': result.get('metadata', {}),  # 元数据
            'created_at': result.get('created_at', ''),
            'finished_at': result.get('finished_at', ''),
            'execution_error': execution_error  # 执行错误信息
        }
        
        # 如果成功解析出产品数据，也包含在响应中
        if products_data and products_data.get('products'):
            response_data['parsed_products'] = products_data
        
        return jsonify(response_data)
    else:
        # 对于运行中的任务，也尝试获取live_url
        result = get_task_detail_from_api(task_id)
        live_url = result.get('live_url', '')
        
        # 如果还没有live_url，再多尝试几次
        if not live_url and status in ['created', 'running']:
            max_retries = 3
            for attempt in range(1, max_retries + 1):
                print(f"[DEBUG] 状态轮询中获取live_url尝试 {attempt}/{max_retries}")
                time.sleep(2)
                
                result = get_task_detail_from_api(task_id)
                if result and 'live_url' in result and result['live_url']:
                    live_url = result['live_url']
                    print(f"[DEBUG] 状态轮询中成功获取live_url: {live_url}")
                    break
        
        # 对于长时间运行的任务，尝试获取中间进度
        intermediate_data = None
        if status == 'running':
            try:
                # 尝试从当前结果中提取中间数据
                intermediate_data = extract_intermediate_progress(result)
                if intermediate_data:
                    print(f"[DEBUG] 提取到中间进度数据: {len(intermediate_data.get('products', []))}个产品")
            except Exception as e:
                print(f"[DEBUG] 提取中间进度失败: {e}")
        
        response_data = {
            'status': status,
            'live_url': live_url,
            'steps': result.get('steps', []),  # 添加步骤信息
            'output': result.get('output', ''),  # 添加输出信息
            'output_files': result.get('output_files', [])  # 添加输出文件列表
        }
        
        print(f"[DEBUG] 返回运行中任务状态: status={status}, live_url={live_url}")
        
        if intermediate_data:
            response_data['intermediate_progress'] = intermediate_data
        
        return jsonify(response_data)

@app.route('/api/prompt', methods=['GET'])
def get_prompt():
    """获取当前的搜索Prompt"""
    return jsonify({'prompt': DEFAULT_PROMPT})

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """获取分类设置"""
    try:
        settings = load_category_settings()
        return jsonify(settings)
    except Exception as e:
        return jsonify({'error': f'获取分类设置失败: {str(e)}'}), 500

@app.route('/api/categories', methods=['POST'])
def save_categories():
    """保存分类设置"""
    try:
        settings = request.json
        if not settings:
            return jsonify({'error': '无效的设置数据'}), 400
        
        # 验证数据结构
        if 'preset' not in settings or 'custom' not in settings:
            return jsonify({'error': '设置数据结构不正确'}), 400
        
        success = save_category_settings(settings)
        if success:
            return jsonify({'success': True, 'message': '分类设置保存成功'})
        else:
            return jsonify({'error': '保存失败'}), 500
    except Exception as e:
        return jsonify({'error': f'保存分类设置时出错: {str(e)}'}), 500

@app.route('/api/categories/reset', methods=['POST'])
def reset_categories():
    """重置分类设置为默认值"""
    try:
        default_settings = get_default_category_settings()
        success = save_category_settings(default_settings)
        if success:
            return jsonify({'success': True, 'message': 'Category settings reset to default values', 'settings': default_settings})
        else:
            return jsonify({'error': 'Reset failed'}), 500
    except Exception as e:
        return jsonify({'error': f'Error resetting category settings: {str(e)}'}), 500

@app.route('/api/search-records', methods=['GET'])
def get_search_records():
    """获取搜索记录列表"""
    try:
        # 自动清理空搜索记录
        cleaned_count = auto_cleanup_empty_searches()
        if cleaned_count > 0:
            print(f"[DEBUG] 自动清理了 {cleaned_count} 个空搜索记录")
        
        status_filter = request.args.get('status', '')
        keyword_filter = request.args.get('keyword', '')
        
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 构建查询条件
                where_conditions = []
                params = []
                
                if status_filter:
                    where_conditions.append("status = %s")
                    params.append(status_filter)
                
                if keyword_filter:
                    where_conditions.append("JSON_SEARCH(keywords, 'one', %s) IS NOT NULL")
                    params.append(f'%{keyword_filter}%')
                
                where_clause = ""
                if where_conditions:
                    where_clause = "WHERE " + " AND ".join(where_conditions)
                
                # 查询搜索记录
                cursor.execute(f"""
                    SELECT id, search_key, keywords, start_date, end_date, 
                           categories, status, total_products, created_at
                    FROM search_records 
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT 50
                """, params)
                
                records = []
                for row in cursor.fetchall():
                    records.append({
                        'id': row[0],
                        'search_key': row[1],
                        'keywords': json.loads(row[2]),
                        'start_date': row[3].isoformat(),
                        'end_date': row[4].isoformat(),
                        'categories': json.loads(row[5]),
                        'status': row[6],
                        'total_products': row[7],
                        'created_at': row[8].isoformat()
                    })
                
                return jsonify({'records': records})
                
    except Exception as e:
        return jsonify({'error': f'获取搜索记录失败: {str(e)}'}), 500

@app.route('/api/search-records/<int:search_id>', methods=['DELETE'])
def delete_search_record(search_id):
    """删除搜索记录及其相关产品和推文"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 检查搜索记录是否存在
                cursor.execute("SELECT id FROM search_records WHERE id = %s", (search_id,))
                if not cursor.fetchone():
                    return jsonify({'error': '搜索记录不存在'}), 404
                
                # 删除搜索记录（由于外键约束，相关的产品和推文会自动删除）
                cursor.execute("DELETE FROM search_records WHERE id = %s", (search_id,))
                connection.commit()
                
                print(f"[DEBUG] 已删除搜索记录 {search_id} 及其所有相关数据")
                return jsonify({'success': True, 'message': '搜索记录已删除'})
                
    except Exception as e:
        return jsonify({'error': f'删除搜索记录失败: {str(e)}'}), 500

def auto_cleanup_empty_searches():
    """自动清理没有产品的搜索记录"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 找到没有产品的已完成搜索记录
                cursor.execute("""
                    SELECT sr.id, sr.keywords 
                    FROM search_records sr 
                    LEFT JOIN products p ON sr.id = p.search_id 
                    WHERE sr.status = 'completed' 
                    AND sr.total_products = 0 
                    AND p.id IS NULL
                """)
                
                empty_searches = cursor.fetchall()
                
                if empty_searches:
                    # 删除这些空搜索记录
                    search_ids = [row[0] for row in empty_searches]
                    placeholders = ','.join(['%s'] * len(search_ids))
                    cursor.execute(f"DELETE FROM search_records WHERE id IN ({placeholders})", search_ids)
                    connection.commit()
                    
                    print(f"[DEBUG] 自动清理了 {len(empty_searches)} 个空搜索记录")
                    return len(empty_searches)
                
                return 0
                
    except Exception as e:
        print(f"[DEBUG] 自动清理失败: {e}")
        return 0

@app.route('/api/search-records/<int:search_id>/products', methods=['GET'])
def get_search_products(search_id):
    """获取指定搜索的产品列表"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, name, description, category, official_url, 
                           first_post_url, deep_search_completed, total_likes, 
                           total_retweets, total_replies, total_views, total_posts
                    FROM products 
                    WHERE search_id = %s
                    ORDER BY total_likes + total_retweets DESC
                """, (search_id,))
                
                products = []
                for row in cursor.fetchall():
                    products.append({
                        'id': row[0],
                        'name': row[1],
                        'description': row[2],
                        'category': row[3],
                        'official_url': row[4],
                        'first_post_url': row[5],
                        'deep_search_completed': row[6],
                        'total_likes': row[7],
                        'total_retweets': row[8],
                        'total_replies': row[9],
                        'total_views': row[10],
                        'total_posts': row[11]
                    })
                
                return jsonify({'products': products})
                
    except Exception as e:
        return jsonify({'error': f'获取产品列表失败: {str(e)}'}), 500

@app.route('/api/task/<task_id>/products', methods=['GET'])
def get_task_products(task_id):
    """根据task_id获取已入库的产品数据，用于在搜索页面展示结果"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 首先根据task_id找到搜索记录
                cursor.execute("SELECT id FROM search_records WHERE task_id = %s", (task_id,))
                search_record = cursor.fetchone()
                
                if not search_record:
                    return jsonify({'products': [], 'message': '未找到对应的搜索记录'})
                
                search_id = search_record[0]
                
                # 获取该搜索的产品列表
                cursor.execute("""
                    SELECT id, name, description, category, official_url, 
                           first_post_url, total_likes, total_retweets, total_replies, total_views
                    FROM products 
                    WHERE search_id = %s
                    ORDER BY total_likes + total_retweets DESC
                """, (search_id,))
                
                products = []
                for row in cursor.fetchall():
                    # 转换为与搜索页面兼容的格式
                    products.append({
                        'id': row[0],
                        'name': row[1],
                        'description': row[2] or 'No description available',
                        'category': row[3] or 'Uncategorized',
                        'url': row[4] or '',  # 官方网站
                        'post_url': row[5] or '',  # 首次发现的推文链接
                        'metrics': {
                            'likes': row[6] or 0,
                            'retweets': row[7] or 0,
                            'replies': row[8] or 0,
                            'views': row[9] or 0
                        }
                    })
                
                return jsonify({
                    'products': products,
                    'total_found': len(products),
                    'summary': f'Successfully found {len(products)} AI products and saved to database'
                })
                
    except Exception as e:
        print(f"[DEBUG] 获取任务产品失败: {e}")
        return jsonify({'error': f'获取产品数据失败: {str(e)}'}), 500

@app.route('/api/products/<int:product_id>', methods=['GET'])
def get_product_detail(product_id):
    """获取产品详情"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 获取产品基本信息和相关搜索记录信息
                cursor.execute("""
                    SELECT p.id, p.name, p.description, p.category, p.official_url, 
                           p.first_post_url, p.deep_search_completed, p.total_likes, 
                           p.total_retweets, p.total_replies, p.total_views, p.total_posts,
                           s.keywords, s.start_date, s.end_date, s.categories, s.task_id
                    FROM products p
                    JOIN search_records s ON p.search_id = s.id
                    WHERE p.id = %s
                """, (product_id,))
                
                product_row = cursor.fetchone()
                if not product_row:
                    return jsonify({'error': '产品不存在'}), 404
                
                product = {
                    'id': product_row[0],
                    'name': product_row[1],
                    'description': product_row[2],
                    'category': product_row[3],
                    'official_url': product_row[4],
                    'first_post_url': product_row[5],
                    'deep_search_completed': product_row[6],
                    'total_likes': product_row[7],
                    'total_retweets': product_row[8],
                    'total_replies': product_row[9],
                    'total_views': product_row[10],
                    'total_posts': product_row[11],
                    'search_info': {
                        'keywords': json.loads(product_row[12]),
                        'start_date': product_row[13].isoformat(),
                        'end_date': product_row[14].isoformat(),
                        'categories': json.loads(product_row[15]),
                        'task_id': product_row[16]
                    }
                }
                
                # 获取相关推文
                cursor.execute("""
                    SELECT post_url, content, author, post_date, 
                           likes, retweets, replies, views, is_original
                    FROM posts 
                    WHERE product_id = %s
                    ORDER BY is_original DESC, likes + retweets DESC
                """, (product_id,))
                
                posts = []
                for row in cursor.fetchall():
                    posts.append({
                        'post_url': row[0],
                        'content': row[1],
                        'author': row[2],
                        'post_date': row[3].isoformat() if row[3] else None,
                        'likes': row[4],
                        'retweets': row[5],
                        'replies': row[6],
                        'views': row[7],
                        'is_original': row[8]
                    })
                
                return jsonify({
                    'product': product,
                    'posts': posts
                })
                
    except Exception as e:
        return jsonify({'error': f'获取产品详情失败: {str(e)}'}), 500

@app.route('/api/products/<int:product_id>/deep-search', methods=['POST'])
def trigger_deep_search(product_id):
    """触发产品深度搜索"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 获取产品信息
                cursor.execute("SELECT name FROM products WHERE id = %s", (product_id,))
                product_row = cursor.fetchone()
                
                if not product_row:
                    return jsonify({'error': '产品不存在'}), 404
                
                product_name = product_row[0]
                
                # 创建深度搜索任务
                deep_search_prompt = f"""You are an expert Twitter researcher tasked with finding ALL posts related to the AI product "{product_name}" from Twitter mirror sites.

CRITICAL REQUIREMENTS:
1. You MUST click on each individual tweet to get the specific post URL
2. Extract real metrics from each individual post page
3. Do NOT return search page URLs - only individual post URLs
4. Search comprehensively across multiple time periods and query variations

Search Strategy:
1. Try multiple Nitter instances (if one fails, try others):
   - https://nitter.privacyredirect.com/
   - https://nitter.net/
   - https://nitter.poast.org/
   - https://nitter.1d4.us/
   - https://nitter.cz/
   - https://nitter.fdn.fr/

2. Comprehensive search queries (try ALL of these):
   - "{product_name}"
   - "{product_name}" AI
   - "{product_name}" launch
   - "{product_name}" launched
   - "{product_name}" review
   - "{product_name}" demo
   - "{product_name}" app
   - "{product_name}" tool
   - "{product_name}" platform
   - "{product_name}" startup
   - "{product_name}" product
   - "{product_name}" announcement
   - "{product_name}" beta
   - "{product_name}" release
   - "{product_name}" new
   - "{product_name}" try
   - "{product_name}" test
   - "{product_name}" experience

3. Time range strategy:
   - Primary: Last 6 months
   - If insufficient results: Expand to last 12 months
   - Search both recent and older posts

4. For EACH post found:
   a) Click on the tweet to open the individual post page
   b) Extract the specific post URL (format: https://nitter.net/username/status/NUMBERS)
   c) Get the actual metrics from that post page (likes, retweets, replies, views)
   d) Extract full content, author, and exact date
   e) Verify the post actually mentions the product

5. Content types to collect:
   - Product announcements and launches
   - User reviews and experiences
   - Demos and tutorials
   - News coverage and articles
   - Community discussions
   - Feature updates and releases
   - Comparisons with other tools
   - User-generated content and showcases

6. Search optimization:
   - Try different sorting options (latest, popular)
   - Search in different languages if applicable
   - Look for hashtags related to the product
   - Check replies and quote tweets

Return ONLY JSON format:
{{
  "posts": [
    {{
      "post_url": "https://nitter.net/username/status/1234567890",
      "content": "Full post text content",
      "author": "username",
      "post_date": "2024-01-01T12:00:00Z",
      "likes": 10,
      "retweets": 5,
      "replies": 2,
      "views": 100
    }}
  ]
}}

IMPORTANT: 
- Aim to find at least 10-20 posts if they exist
- Only include posts that actually mention "{product_name}"
- Return ONLY the JSON object with SPECIFIC individual post URLs
- Do NOT include search page URLs or general profile URLs"""
                
                # 创建Browser-use任务
                task_result = create_browser_task(deep_search_prompt)
                
                if task_result and 'id' in task_result:
                    # 标记产品正在进行深度搜索
                    cursor.execute("""
                        UPDATE products 
                        SET deep_search_completed = FALSE 
                        WHERE id = %s
                    """, (product_id,))
                    connection.commit()
                    
                    return jsonify({
                        'success': True,
                        'task_id': task_result['id'],
                        'product_id': product_id,
                        'message': '深度搜索任务已启动'
                    })
                else:
                    return jsonify({'error': '启动深度搜索失败'}), 500
                    
    except Exception as e:
        return jsonify({'error': f'启动深度搜索失败: {str(e)}'}), 500

@app.route('/api/months', methods=['GET'])
def get_months():
    """获取所有搜索月份列表"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 查询所有搜索记录的日期范围，按月份分组统计
                # 移除状态判断，只要有关联的产品就显示
                query = """
                    SELECT 
                        DATE_FORMAT(sr.start_date, %s) as month,
                        DATE_FORMAT(sr.start_date, %s) as month_display,
                        COUNT(DISTINCT sr.id) as search_count,
                        COUNT(DISTINCT p.id) as product_count,
                        MIN(sr.start_date) as earliest_date,
                        MAX(sr.end_date) as latest_date
                    FROM search_records sr
                    LEFT JOIN products p ON sr.id = p.search_id
                    WHERE EXISTS (SELECT 1 FROM products p2 WHERE p2.search_id = sr.id)
                    GROUP BY DATE_FORMAT(sr.start_date, %s), DATE_FORMAT(sr.start_date, %s)
                    ORDER BY month DESC
                """
                cursor.execute(query, ('%Y%m', '%Y-%m', '%Y%m', '%Y-%m'))
                
                months = []
                for row in cursor.fetchall():
                    months.append({
                        'month': row[0],  # 202507
                        'month_display': row[1],  # 2025-07
                        'search_count': row[2],
                        'product_count': row[3] or 0,
                        'earliest_date': row[4].isoformat() if row[4] else None,
                        'latest_date': row[5].isoformat() if row[5] else None
                    })
                
                return jsonify({'months': months})
                
    except Exception as e:
        return jsonify({'error': f'Failed to load months list: {str(e)}'}), 500

@app.route('/api/months/<month>/products', methods=['GET'])
def get_products_by_month(month):
    """获取指定月份的所有产品"""
    try:
        # 验证月份格式 (YYYYMM)
        if not month.isdigit() or len(month) != 6:
            return jsonify({'error': 'Invalid month format, should be YYYYMM'}), 400
        
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                # 查询指定月份的所有产品
                # 移除状态判断，获取所有关联的产品
                query = """
                    SELECT 
                        p.id, p.name, p.description, p.category, p.official_url,
                        p.first_post_url, p.total_likes, p.total_retweets, 
                        p.total_replies, p.total_views, p.total_posts,
                        sr.start_date, sr.end_date, sr.keywords
                    FROM products p
                    JOIN search_records sr ON p.search_id = sr.id
                    WHERE DATE_FORMAT(sr.start_date, %s) = %s
                    ORDER BY p.total_likes + p.total_retweets DESC
                """
                cursor.execute(query, ('%Y%m', month))
                
                products = []
                for row in cursor.fetchall():
                    products.append({
                        'id': row[0],
                        'name': row[1],
                        'description': row[2] or 'No description available',
                        'category': row[3] or 'Uncategorized',
                        'url': row[4] or '',  # 官方网站
                        'post_url': row[5] or '',  # 首次发现的推文链接
                        'metrics': {
                            'likes': row[6] or 0,
                            'retweets': row[7] or 0,
                            'replies': row[8] or 0,
                            'views': row[9] or 0
                        },
                        'total_posts': row[10] or 1,
                        'search_info': {
                            'start_date': row[11].isoformat() if row[11] else None,
                            'end_date': row[12].isoformat() if row[12] else None,
                            'keywords': json.loads(row[13]) if row[13] else []
                        }
                    })
                
                # 格式化月份显示
                year = month[:4]
                month_num = month[4:]
                month_display = f"{year}-{month_num.zfill(2)}"
                
                return jsonify({
                    'month': month,
                    'month_display': month_display,
                    'products': products,
                    'total_count': len(products)
                })
                
    except Exception as e:
        return jsonify({'error': f'Failed to load products for month: {str(e)}'}), 500

def process_deep_search_result(task_id, product_id, posts_data):
    """处理深度搜索结果，保存推文并更新产品汇总数据"""
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                posts = posts_data.get('posts', [])
                
                if not posts:
                    # 标记深度搜索完成，即使没有找到新推文
                    cursor.execute("""
                        UPDATE products 
                        SET deep_search_completed = TRUE 
                        WHERE id = %s
                    """, (product_id,))
                    connection.commit()
                    return
                
                total_likes = 0
                total_retweets = 0
                total_replies = 0
                total_views = 0
                new_posts_count = 0
                
                for post in posts:
                    try:
                        # 尝试插入新推文（如果不存在）
                        cursor.execute("""
                            INSERT IGNORE INTO posts (
                                product_id, post_url, content, author, post_date,
                                likes, retweets, replies, views, is_original
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            product_id,
                            post.get('post_url', ''),
                            post.get('content', ''),
                            post.get('author', ''),
                            post.get('post_date'),
                            post.get('likes', 0),
                            post.get('retweets', 0),
                            post.get('replies', 0),
                            post.get('views', 0),
                            False  # 深度搜索找到的推文标记为非原始
                        ))
                        
                        if cursor.rowcount > 0:  # 新插入的推文
                            new_posts_count += 1
                        
                        # 累计社交数据
                        total_likes += post.get('likes', 0)
                        total_retweets += post.get('retweets', 0)
                        total_replies += post.get('replies', 0)
                        total_views += post.get('views', 0)
                        
                    except Exception as e:
                        print(f"[DEBUG] 插入推文时出错: {e}")
                        continue
                
                # 更新产品的汇总数据
                cursor.execute("""
                    UPDATE products 
                    SET deep_search_completed = TRUE,
                        total_likes = total_likes + %s,
                        total_retweets = total_retweets + %s,
                        total_replies = total_replies + %s,
                        total_views = total_views + %s,
                        total_posts = total_posts + %s
                    WHERE id = %s
                """, (
                    total_likes, total_retweets, total_replies, 
                    total_views, new_posts_count, product_id
                ))
                
                connection.commit()
                print(f"[DEBUG] 深度搜索完成，产品{product_id}新增{new_posts_count}条推文")
                
    except Exception as e:
        print(f"[DEBUG] 处理深度搜索结果时出错: {e}")
        # 即使出错也要标记深度搜索完成，避免状态卡住
        try:
            with get_db_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("""
                        UPDATE products 
                        SET deep_search_completed = TRUE 
                        WHERE id = %s
                    """, (product_id,))
                    connection.commit()
        except:
            pass

@app.route('/api/deep-search/<task_id>/status', methods=['GET'])
def deep_search_status(task_id):
    """检查深度搜索任务状态"""
    try:
        product_id = request.args.get('product_id')
        if not product_id:
            return jsonify({'error': '缺少product_id参数'}), 400
        
        product_id = int(product_id)
        status = get_task_status_from_api(task_id)
        
        print(f"[DEBUG] 深度搜索任务 {task_id} 状态: {status}")
        
        if status in ['finished', 'failed', 'stopped']:
            if status == 'finished':
                # 获取任务结果
                result = get_task_detail_from_api(task_id)
                
                # 尝试解析推文数据
                posts_data = parse_deep_search_result(result)
                
                # 处理深度搜索结果
                process_deep_search_result(task_id, product_id, posts_data)
                
                return jsonify({
                    'status': 'completed',
                    'message': '深度搜索已完成',
                    'posts_found': len(posts_data.get('posts', []))
                })
            else:
                # 搜索失败，标记完成状态
                with get_db_connection() as connection:
                    with connection.cursor() as cursor:
                        cursor.execute("""
                            UPDATE products 
                            SET deep_search_completed = TRUE 
                            WHERE id = %s
                        """, (product_id,))
                        connection.commit()
                
                return jsonify({
                    'status': 'failed',
                    'message': '深度搜索失败'
                })
        else:
            return jsonify({
                'status': 'running',
                'message': '深度搜索进行中'
            })
            
    except Exception as e:
        print(f"[DEBUG] 检查深度搜索状态时出错: {e}")
        return jsonify({'error': f'检查状态失败: {str(e)}'}), 500

def parse_deep_search_result(result):
    """解析深度搜索结果"""
    if not result:
        return {'posts': []}
    
    print(f"[DEBUG] 开始解析深度搜索结果")
    
    # 尝试从结果中提取JSON数据
    for field in ['result', 'output', 'data', 'response', 'content']:
        if field in result and result[field]:
            try:
                if isinstance(result[field], str):
                    # 尝试提取嵌入的JSON
                    json_data = extract_json_from_text(result[field])
                    if json_data and 'posts' in json_data:
                        print(f"[DEBUG] 成功从深度搜索结果中提取{len(json_data['posts'])}条推文")
                        return json_data
                    
                    # 尝试直接解析为JSON
                    try:
                        data = json.loads(result[field])
                        if 'posts' in data:
                            print(f"[DEBUG] 深度搜索结果是纯JSON格式")
                            return data
                    except:
                        pass
                        
                elif isinstance(result[field], dict) and 'posts' in result[field]:
                    print(f"[DEBUG] 深度搜索结果已经是dict格式")
                    return result[field]
            except Exception as e:
                print(f"[DEBUG] 处理深度搜索字段 '{field}' 时出错: {e}")
                continue
    
    print(f"[DEBUG] 未能解析出推文数据，返回空结果")
    return {'posts': []}



def create_browser_task(prompt):
    """创建Browser-use任务"""
    url = "https://api.browser-use.com/api/v1/run-task"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {
        "task": prompt,
        "llm_model": MODEL
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()
        print(f"[DEBUG] 创建任务响应: {result}")
        return result
    except Exception as e:
        print(f"创建任务失败: {e}")
        return None

def get_task_status_from_api(task_id):
    """获取任务状态"""
    url = f"https://api.browser-use.com/api/v1/task/{task_id}/status"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        # 返回状态字符串，而不是整个响应
        if isinstance(data, dict) and 'status' in data:
            return data['status']
        elif isinstance(data, str):
            return data
        else:
            print(f"[DEBUG] 未知的状态响应格式: {data}")
            return str(data)
    except Exception as e:
        print(f"获取任务状态失败: {e}")
        return 'error'

def get_task_detail_from_api(task_id):
    """获取任务详情"""
    url = f"https://api.browser-use.com/api/v1/task/{task_id}"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        result = response.json()
        print(f"[DEBUG] 任务详情: {result}")
        return result
    except Exception as e:
        print(f"获取任务详情失败: {e}")
        return {}

def parse_task_result(result):
    """解析任务结果，提取产品信息，支持从失败任务中恢复数据"""
    if not result:
        return {'products': [], 'summary': '任务结果为空', 'note': '', 'total_found': 0}
    
    print(f"[DEBUG] 开始解析任务结果: {str(result)[:200]}...")
    
    # 首先尝试从输出文件中提取数据
    if 'output_files' in result and result['output_files']:
        print(f"[DEBUG] 发现输出文件: {result['output_files']}")
        file_data = try_extract_from_output_files(result)
        if file_data and file_data.get('products'):
            print(f"[DEBUG] 成功从输出文件中提取 {len(file_data['products'])} 个产品")
            return file_data
    
    # 然后尝试从正常结果字段中提取数据
    products_data = try_extract_from_result_fields(result)
    if products_data and products_data.get('products'):
        return products_data
    
    # 如果正常字段没有数据，尝试从执行日志中恢复数据
    print(f"[DEBUG] 正常字段未找到数据，尝试从执行日志恢复...")
    recovered_data = recover_data_from_logs(result)
    if recovered_data and recovered_data.get('products'):
        print(f"[DEBUG] 成功从执行日志恢复 {len(recovered_data['products'])} 个产品")
        return recovered_data
    
    # 如果没有找到结构化数据，返回空结果
    print(f"[DEBUG] 未能解析出产品数据，返回空结果")
    return {'products': [], 'summary': '未能解析搜索结果', 'note': '', 'total_found': 0}

def try_extract_from_result_fields(result):
    """尝试从结果的各个字段中提取数据"""
    # 尝试从结果中提取JSON数据
    for field in ['result', 'output', 'data', 'response', 'content']:
        if field in result and result[field]:
            print(f"[DEBUG] 检查字段 '{field}'")
            try:
                if isinstance(result[field], str):
                    # 首先尝试提取嵌入的JSON
                    json_data = extract_json_from_text(result[field])
                    if json_data and 'products' in json_data:
                        print(f"[DEBUG] 成功从文本中提取JSON数据")
                        # 同时提取文本描述
                        text_parts = result[field].split('{')[0].strip()
                        if text_parts:
                            text_data = parse_text_description(text_parts)
                            json_data.update(text_data)
                        return json_data
                    
                    # 如果没有找到嵌入的JSON，尝试直接解析为JSON
                    try:
                        data = json.loads(result[field])
                        if 'products' in data:
                            print(f"[DEBUG] 字段是纯JSON格式")
                            return data
                    except:
                        pass
                    
                    # 尝试解析文本格式的产品信息
                    if field == 'output' and 'Products Discovered:' in result[field]:
                        print(f"[DEBUG] 尝试解析文本格式的产品信息")
                        text_products = parse_text_products(result[field])
                        if text_products:
                            return text_products
                        
                elif isinstance(result[field], dict) and 'products' in result[field]:
                    print(f"[DEBUG] 字段已经是dict格式")
                    return result[field]
            except Exception as e:
                print(f"[DEBUG] 处理字段 '{field}' 时出错: {e}")
                continue
    
    return None

def parse_text_products(text):
    """解析文本格式的产品信息"""
    try:
        products = []
        lines = text.split('\n')
        
        # 查找产品列表开始位置
        start_idx = -1
        for i, line in enumerate(lines):
            if 'Products Discovered:' in line:
                start_idx = i + 1
                break
        
        if start_idx == -1:
            return None
        
        # 解析每个产品
        current_product = None
        for i in range(start_idx, len(lines)):
            line = lines[i].strip()
            
            # 跳过空行和分隔符
            if not line or line.startswith('**Categories') or line.startswith('All products'):
                break
                
            # 检查是否是产品行（以数字开头）
            if line and line[0].isdigit() and '**' in line:
                # 解析产品信息：1. **Product Name** - Category (description)
                parts = line.split('**')
                if len(parts) >= 3:
                    product_name = parts[1].strip()
                    remaining = parts[2].strip()
                    
                    # 解析类别和描述
                    if ' - ' in remaining:
                        category_desc = remaining.split(' - ', 1)
                        category = category_desc[0].strip()
                        description = category_desc[1].strip() if len(category_desc) > 1 else ''
                        # 移除括号
                        if description.startswith('(') and description.endswith(')'):
                            description = description[1:-1]
                    else:
                        category = 'Other'
                        description = remaining
                    
                    current_product = {
                        'name': product_name,
                        'description': description,
                        'url': '',  # 文本中没有URL信息
                        'category': category,
                        'discovery_post': {
                            'post_url': '',
                            'metrics': {'likes': 0, 'retweets': 0, 'replies': 0, 'views': 0}
                        },
                        'all_posts': []
                    }
                    products.append(current_product)
        
        if products:
            print(f"[DEBUG] 成功解析出 {len(products)} 个产品")
            return {
                'products': products,
                'summary': f'成功发现 {len(products)} 个AI产品',
                'note': '从文本格式解析',
                'total_found': len(products)
            }
        
        return None
        
    except Exception as e:
        print(f"[DEBUG] 解析文本产品信息失败: {e}")
        return None

def try_extract_from_output_files(result):
    """尝试从输出文件中提取数据"""
    if not result.get('output_files'):
        return None
    
    task_id = result.get('id')
    if not task_id:
        print(f"[DEBUG] 无法获取task_id，无法下载输出文件")
        return None
    
    # 查找JSON文件
    json_files = [f for f in result['output_files'] if f.endswith('.json')]
    if not json_files:
        print(f"[DEBUG] 输出文件中没有JSON文件")
        return None
    
    # 尝试获取每个JSON文件的内容
    for filename in json_files:
        print(f"[DEBUG] 尝试获取文件内容: {filename}")
        file_content = get_output_file_content(task_id, filename)
        if file_content:
            try:
                # 尝试解析JSON内容
                if isinstance(file_content, str):
                    data = json.loads(file_content)
                else:
                    data = file_content
                
                if isinstance(data, dict) and 'products' in data:
                    print(f"[DEBUG] 成功从文件 {filename} 中解析出产品数据")
                    return data
            except Exception as e:
                print(f"[DEBUG] 解析文件 {filename} 失败: {e}")
                continue
    
    return None

def get_output_file_content(task_id, filename):
    """获取browser-use输出文件的内容"""
    url = f"https://api.browser-use.com/api/v1/task/{task_id}/file/{filename}"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        
        # 如果是404错误，说明文件不存在
        if response.status_code == 404:
            print(f"[DEBUG] 文件 {filename} 不存在 (404)")
            return None
        
        response.raise_for_status()
        
        # 检查响应内容类型
        content_type = response.headers.get('content-type', '')
        if 'application/json' in content_type:
            return json.dumps(response.json(), indent=2, ensure_ascii=False)
        else:
            # 对于文本文件，直接返回内容
            return response.text
    except requests.exceptions.RequestException as e:
        print(f"[DEBUG] 获取文件 {filename} 内容失败: {e}")
        return None
    except Exception as e:
        print(f"[DEBUG] 处理文件 {filename} 内容时出错: {e}")
        return None

def recover_data_from_logs(result):
    """从执行日志中恢复数据"""
    try:
        # 获取执行日志
        execution_logs = get_execution_logs(result)
        if not execution_logs:
            return None
        
        print(f"[DEBUG] 开始分析执行日志，共 {len(execution_logs)} 条记录")
        
        # 从日志中提取产品信息
        products = []
        current_product = None
        
        for log_entry in execution_logs:
            # 尝试从每条日志中提取产品信息
            extracted_products = extract_products_from_log_entry(log_entry)
            if extracted_products:
                products.extend(extracted_products)
        
        # 去重处理
        unique_products = deduplicate_products(products)
        
        if unique_products:
            return {
                'products': unique_products,
                'summary': f'从执行日志中恢复了 {len(unique_products)} 个产品',
                'note': '数据来源：执行日志恢复',
                'total_found': len(unique_products),
                'recovered_from_logs': True
            }
        
        return None
        
    except Exception as e:
        print(f"[DEBUG] 从执行日志恢复数据时出错: {e}")
        return None

def get_execution_logs(result):
    """获取执行日志"""
    logs = []
    
    # 检查不同可能包含日志的字段
    log_fields = ['logs', 'execution_logs', 'steps', 'actions', 'history', 'trace']
    
    for field in log_fields:
        if field in result and result[field]:
            if isinstance(result[field], list):
                logs.extend(result[field])
            elif isinstance(result[field], str):
                # 尝试解析字符串格式的日志
                try:
                    parsed_logs = json.loads(result[field])
                    if isinstance(parsed_logs, list):
                        logs.extend(parsed_logs)
                except:
                    # 如果不是JSON，按行分割
                    lines = result[field].split('\n')
                    logs.extend([{'content': line.strip()} for line in lines if line.strip()])
    
    # 如果没有找到专门的日志字段，尝试从主要内容中提取
    if not logs:
        for field in ['result', 'output', 'content']:
            if field in result and isinstance(result[field], str):
                # 查找看起来像执行步骤的内容
                content = result[field]
                
                # 查找步骤模式
                step_patterns = [
                    r'(\d+\.\s+.+?)(?=\d+\.|$)',  # 数字列表
                    r'(Step \d+:.+?)(?=Step \d+:|$)',  # Step格式
                    r'(•\s+.+?)(?=•\s+|$)',  # 项目符号
                    r'(-\s+.+?)(?=-\s+|$)'   # 破折号列表
                ]
                
                import re
                for pattern in step_patterns:
                    matches = re.findall(pattern, content, re.DOTALL | re.MULTILINE)
                    if matches:
                        logs.extend([{'content': match.strip()} for match in matches])
                        break
                
                # 如果没有找到结构化步骤，按句子分割
                if not logs:
                    sentences = content.split('.')
                    logs.extend([{'content': sentence.strip() + '.'} for sentence in sentences if len(sentence.strip()) > 10])
    
    return logs

def extract_products_from_log_entry(log_entry):
    """从单个日志条目中提取产品信息"""
    products = []
    
    try:
        # 获取日志内容
        content = ""
        if isinstance(log_entry, dict):
            content = log_entry.get('content', '') or log_entry.get('message', '') or log_entry.get('text', '')
        elif isinstance(log_entry, str):
            content = log_entry
        
        if not content:
            return products
        
        # 查找产品名称模式
        product_patterns = [
            r'(?:产品|Product|App|Tool)[:：]\s*([A-Za-z0-9\s\-\.]+)',
            r'([A-Za-z][A-Za-z0-9\s\-\.]{2,30})\s*(?:is|was|launched|released)',
            r'(?:found|discovered|identified)[:：]?\s*([A-Za-z][A-Za-z0-9\s\-\.]{2,30})',
            r'([A-Z][A-Za-z0-9]{2,20}(?:\s+[A-Z][A-Za-z0-9]{2,20})*)\s*[-–—]\s*(.{10,100})',
        ]
        
        import re
        for pattern in product_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple):
                    name = match[0].strip()
                    description = match[1].strip() if len(match) > 1 else ""
                else:
                    name = match.strip()
                    description = ""
                
                # 过滤掉明显不是产品名的内容
                if is_valid_product_name(name):
                    # 尝试从内容中提取更多信息
                    category = extract_category_from_content(content)
                    url = extract_url_from_content(content)
                    metrics = extract_metrics_from_content(content)
                    
                    product = {
                        'name': name,
                        'description': description or extract_description_from_content(content, name),
                        'url': url,
                        'category': category,
                        'metrics': metrics,
                        'post_url': extract_post_url_from_content(content),
                        'source': 'log_recovery'
                    }
                    products.append(product)
        
        # 查找JSON片段
        json_match = re.search(r'\{[^{}]*"name"[^{}]*\}', content)
        if json_match:
            try:
                json_data = json.loads(json_match.group())
                if 'name' in json_data:
                    products.append({
                        'name': json_data.get('name', ''),
                        'description': json_data.get('description', ''),
                        'url': json_data.get('url', ''),
                        'category': json_data.get('category', 'Other'),
                        'metrics': json_data.get('metrics', {}),
                        'post_url': json_data.get('post_url', ''),
                        'source': 'log_recovery'
                    })
            except:
                pass
        
    except Exception as e:
        print(f"[DEBUG] 从日志条目提取产品信息时出错: {e}")
    
    return products

def is_valid_product_name(name):
    """检查是否是有效的产品名称"""
    if not name or len(name) < 2 or len(name) > 50:
        return False
    
    # 排除常见的非产品名称
    invalid_patterns = [
        r'^(the|a|an|and|or|but|in|on|at|to|for|of|with|by)$',
        r'^(click|scroll|search|find|navigate|extract|update)$',
        r'^(nitter|twitter|post|tweet|link|url|http)$',
        r'^\d+$',  # 纯数字
        r'^[^\w\s]+$',  # 只有标点符号
    ]
    
    import re
    for pattern in invalid_patterns:
        if re.match(pattern, name, re.IGNORECASE):
            return False
    
    return True

def extract_category_from_content(content):
    """从内容中提取分类"""
    categories = {
        'Text Generation': ['text', 'writing', 'content', 'article', 'blog'],
        'Image Generation': ['image', 'photo', 'picture', 'visual', 'art', 'design'],
        'Video Generation': ['video', 'movie', 'animation', 'clip'],
        'Audio Generation': ['audio', 'music', 'sound', 'voice', 'speech'],
        'Productivity': ['productivity', 'task', 'workflow', 'automation', 'efficiency'],
        'Development': ['code', 'development', 'programming', 'developer', 'API'],
        'Other': []
    }
    
    content_lower = content.lower()
    for category, keywords in categories.items():
        for keyword in keywords:
            if keyword in content_lower:
                return category
    
    return 'Other'

def extract_url_from_content(content):
    """从内容中提取URL"""
    import re
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?]'
    matches = re.findall(url_pattern, content)
    
    # 过滤掉nitter链接，返回产品官网
    for url in matches:
        if 'nitter' not in url.lower() and 'twitter' not in url.lower():
            return url
    
    return ''

def extract_metrics_from_content(content):
    """从内容中提取社交媒体指标"""
    metrics = {'likes': 0, 'retweets': 0, 'replies': 0, 'views': 0}
    
    import re
    # 查找数字模式
    patterns = {
        'likes': [r'(\d+)\s*(?:like|点赞)', r'❤️\s*(\d+)', r'♥\s*(\d+)'],
        'retweets': [r'(\d+)\s*(?:retweet|转发)', r'🔄\s*(\d+)', r'RT\s*(\d+)'],
        'replies': [r'(\d+)\s*(?:repl|回复)', r'💬\s*(\d+)'],
        'views': [r'(\d+)\s*(?:view|浏览)', r'👁\s*(\d+)', r'(\d+)\s*views?']
    }
    
    for metric, metric_patterns in patterns.items():
        for pattern in metric_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                try:
                    metrics[metric] = int(matches[0])
                    break
                except:
                    continue
    
    return metrics

def extract_description_from_content(content, product_name):
    """从内容中提取产品描述"""
    # 查找产品名称附近的描述文本
    import re
    
    # 在产品名称前后查找描述
    pattern = rf'{re.escape(product_name)}\s*[-–—:：]\s*([^.!?]{10,100})'
    match = re.search(pattern, content, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    # 查找包含产品名称的句子
    sentences = re.split(r'[.!?]+', content)
    for sentence in sentences:
        if product_name.lower() in sentence.lower():
            # 清理句子并返回
            cleaned = re.sub(r'\s+', ' ', sentence.strip())
            if 10 <= len(cleaned) <= 200:
                return cleaned
    
    return ''

def extract_post_url_from_content(content):
    """从内容中提取推文URL"""
    import re
    # 查找nitter链接
    nitter_pattern = r'https?://nitter[^/]*\.[^/]+/[^/]+/status/\d+'
    matches = re.findall(nitter_pattern, content)
    return matches[0] if matches else ''

def deduplicate_products(products):
    """去重产品列表"""
    seen_names = set()
    unique_products = []
    
    for product in products:
        name = product.get('name', '').strip().lower()
        if name and name not in seen_names:
            seen_names.add(name)
            unique_products.append(product)
    
    return unique_products

def extract_json_from_text(text):
    """从文本中提取JSON对象，支持中英文混合内容"""
    try:
        # 处理可能存在的标记
        text = text.replace('json\nCopy\n', '').replace('json Copy\n', '').replace('```json', '').replace('```', '')
        
        # 多种方式查找JSON
        json_patterns = [
            # 标准JSON块
            r'\{[^{}]*"products"[^{}]*\[[^\]]*\][^{}]*\}',
            # 嵌套JSON
            r'\{.*?"products"\s*:\s*\[.*?\].*?\}',
            # 简单匹配
            r'\{.*?"products".*?\}',
        ]
        
        import re
        for pattern in json_patterns:
            matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
            for match in matches:
                try:
                    parsed_json = json.loads(match)
                    if 'products' in parsed_json:
                        print(f"[DEBUG] 成功解析JSON，产品数量: {len(parsed_json.get('products', []))}")
                        return parsed_json
                except:
                    continue
        
        # 如果正则匹配失败，尝试手动查找
        start_idx = text.find('{')
        if start_idx == -1:
            # 尝试查找中文结果格式
            return parse_chinese_result_format(text)
            
        # 从开始位置查找匹配的结束括号
        brace_count = 0
        end_idx = start_idx
        in_string = False
        escape_next = False
        
        for i in range(start_idx, len(text)):
            char = text[i]
            
            if escape_next:
                escape_next = False
                continue
                
            if char == '\\' and in_string:
                escape_next = True
                continue
                
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
                
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
        
        if end_idx > start_idx and brace_count == 0:
            json_str = text[start_idx:end_idx]
            print(f"[DEBUG] 提取的JSON字符串: {json_str[:500]}...")
            try:
                parsed_json = json.loads(json_str)
                print(f"[DEBUG] 成功解析JSON，产品数量: {len(parsed_json.get('products', []))}")
                return parsed_json
            except json.JSONDecodeError as e:
                print(f"[DEBUG] JSON解析错误: {e}")
                print(f"[DEBUG] 错误位置附近的内容: {json_str[max(0, e.pos-50):e.pos+50]}")
                # 尝试修复常见的JSON错误
                fixed_json = fix_json_errors(json_str)
                if fixed_json:
                    try:
                        parsed_json = json.loads(fixed_json)
                        print(f"[DEBUG] 修复后成功解析JSON，产品数量: {len(parsed_json.get('products', []))}")
                        return parsed_json
                    except:
                        pass
            
    except Exception as e:
        print(f"[DEBUG] 提取JSON失败: {e}")
        # 如果JSON解析失败，尝试解析中文格式
        return parse_chinese_result_format(text)
    
    return None

def fix_json_errors(json_str):
    """修复常见的JSON错误"""
    try:
        # 移除可能的markdown标记
        json_str = json_str.replace('```json', '').replace('```', '')
        
        # 修复常见的URL问题
        import re
        
        # 修复被截断的URL
        json_str = re.sub(r'"url":\s*"[^"]*\.\.\.[^"]*"', '"url": ""', json_str)
        
        # 修复未闭合的字符串
        # 查找最后一个完整的对象
        last_complete_obj = json_str.rfind('}')
        if last_complete_obj != -1:
            # 检查是否有未闭合的数组
            remaining = json_str[last_complete_obj+1:].strip()
            if remaining and not remaining.endswith(']'):
                # 尝试闭合数组和对象
                if remaining.count('[') > remaining.count(']'):
                    json_str = json_str[:last_complete_obj+1] + ']'
                if json_str.count('{') > json_str.count('}'):
                    json_str += '}'
        
        # 修复尾随逗号
        json_str = re.sub(r',\s*([}\]])', r'\1', json_str)
        
        # 修复缺少引号的键
        json_str = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', json_str)
        
        return json_str
        
    except Exception as e:
        print(f"[DEBUG] 修复JSON时出错: {e}")
        return None

def parse_chinese_result_format(text):
    """解析中文格式的结果"""
    try:
        print(f"[DEBUG] 尝试解析中文格式结果...")
        
        # 查找产品信息的模式
        import re
        
        # 查找产品名称
        name_patterns = [
            r'"name":\s*"([^"]+)"',
            r'产品名称[：:]\s*([^\n,]+)',
            r'name[：:]\s*([^\n,]+)',
        ]
        
        products = []
        
        # 尝试提取结构化信息
        for pattern in name_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                product_name = match.strip()
                if product_name and len(product_name) > 1:
                    # 查找对应的描述
                    desc_pattern = rf'{re.escape(product_name)}[^{{]*?"description":\s*"([^"]+)"'
                    desc_match = re.search(desc_pattern, text, re.IGNORECASE | re.DOTALL)
                    description = desc_match.group(1) if desc_match else ""
                    
                    # 查找URL
                    url_pattern = rf'{re.escape(product_name)}[^{{]*?"url":\s*"([^"]+)"'
                    url_match = re.search(url_pattern, text, re.IGNORECASE | re.DOTALL)
                    url = url_match.group(1) if url_match else ""
                    
                    products.append({
                        'name': product_name,
                        'description': description,
                        'url': url,
                        'category': 'Productivity',  # 默认分类
                        'discovery_post': {
                            'post_url': '',
                            'metrics': {'likes': 0, 'retweets': 0, 'replies': 0, 'views': 0}
                        },
                        'all_posts': []
                    })
        
        if products:
            print(f"[DEBUG] 从中文格式解析出 {len(products)} 个产品")
            return {
                'products': products,
                'summary': f'从中文格式结果中解析出 {len(products)} 个产品',
                'total_found': len(products)
            }
            
    except Exception as e:
        print(f"[DEBUG] 解析中文格式失败: {e}")
    
    return None

def parse_text_description(text):
    """解析文本描述部分，提取summary和note"""
    lines = text.strip().split('\n')
    summary_lines = []
    note_lines = []
    
    # 查找关键分隔词
    found_here_are = False
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        if "Here are" in line or "Products Found:" in line:
            found_here_are = True
            continue
            
        if not found_here_are:
            summary_lines.append(line)
        elif line.startswith("The search was") or line.startswith("All products"):
            note_lines.append(line)
    
    summary = " ".join(summary_lines)
    note = " ".join(note_lines)
    
    # 提取产品数量
    total_found = 0
    for line in summary_lines:
        if "found" in line.lower() and any(char.isdigit() for char in line):
            # 提取数字
            import re
            numbers = re.findall(r'\d+', line)
            if numbers:
                total_found = int(numbers[0])
                break
    
    return {
        'summary': summary,
        'note': note,
        'total_found': total_found
    }

def detect_execution_issues(result):
    """检测任务执行中的问题，返回错误描述"""
    if not result:
        return "任务结果为空"
    
    # 检查步骤中是否有执行中断的迹象
    steps = result.get('steps', [])
    if steps:
        last_step = steps[-1]
        if last_step:
            # 检查最后一步的评估信息
            evaluation = last_step.get('evaluation_previous_goal', '')
            next_goal = last_step.get('next_goal', '')
            
            # 常见的执行中断关键词
            stop_keywords = [
                'execution stopped', 'stopped', 'failed', 'error', 
                '执行停止', '执行中断', '失败', '错误'
            ]
            
            for keyword in stop_keywords:
                if keyword.lower() in evaluation.lower() or keyword.lower() in next_goal.lower():
                    return f"任务执行中断: {evaluation or next_goal}"
    
    # 检查输出是否为空但状态为finished
    if result.get('status') == 'finished' and not result.get('output'):
        return "任务虽然完成但未产生有效输出"
    
    # 检查是否有错误信息
    if 'error' in result:
        return f"任务执行错误: {result.get('error')}"
    
    return None

def extract_intermediate_progress(result):
    """从运行中的任务中提取中间进度数据"""
    if not result:
        return None
    
    try:
        # 尝试从结果中提取部分完成的数据
        # 这可能包括已经收集到的产品信息，即使任务还在运行
        
        # 检查是否有部分结果
        partial_data = None
        
        # 从各种可能的字段中查找部分数据
        for field in ['partial_result', 'intermediate_data', 'current_state', 'progress']:
            if field in result and result[field]:
                try:
                    if isinstance(result[field], str):
                        partial_data = extract_json_from_text(result[field])
                    elif isinstance(result[field], dict):
                        partial_data = result[field]
                    
                    if partial_data and 'products' in partial_data:
                        break
                except:
                    continue
        
        # 如果没有找到专门的中间数据字段，尝试从主要内容中提取
        if not partial_data:
            # 尝试从执行日志中提取当前已发现的产品
            logs_data = recover_data_from_logs(result)
            if logs_data and logs_data.get('products'):
                partial_data = {
                    'products': logs_data['products'],
                    'summary': f'中间进度：已发现{len(logs_data["products"])}个产品',
                    'is_intermediate': True
                }
        
        return partial_data
        
    except Exception as e:
        print(f"[DEBUG] 提取中间进度数据时出错: {e}")
        return None



if __name__ == '__main__':
    # 初始化数据库
    print("正在初始化数据库...")
    try:
        init_database()
        print("数据库初始化成功！")
        
        # 执行数据库迁移
        migrate_database()
        
        # 清理失效任务
        cleanup_stale_tasks()
    except Exception as e:
        print(f"数据库初始化失败: {e}")
        print("应用将继续运行，但分类管理功能可能无法正常工作")
    
    # 在生产环境中监听所有网络接口
    app.run(debug=False, host='0.0.0.0', port=8080)