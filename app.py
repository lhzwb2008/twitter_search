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

# 默认的搜索Prompt - 灵活版
DEFAULT_PROMPT = """You are an AI Product Discovery Expert. Your goal is to find AI-related products from Twitter mirror sites.

IMPORTANT: You MUST return at least 3 AI products in JSON format. Follow these flexible strategies:

1. Primary Strategy - Try multiple Nitter instances:
   - https://nitter.privacyredirect.com/
   - https://nitter.net/
   - https://nitter.poast.org/
   - https://nitter.1d4.us/
   If one fails, try the next one.

2. Search Flexibility:
   - Start with date range: 2025-06-01 to 2025-07-01
   - If no results, expand to: 2025-05-01 to 2025-07-31
   - If still no results, search last 90 days
   - Try multiple queries:
     * "AI app" OR "AI tool" launch
     * "new AI" startup
     * "launched AI" product
     * "AI agent" OR "AI assistant"
     * Just "AI" with recent filter

3. Result Requirements:
   - MUST find at least 3 AI-related products
   - If exact matches aren't found, include ANY AI products you find
   - Products can be from any time period if needed
   - Include products even without all details (fill missing with empty strings)

4. Output Format (MANDATORY):
   You MUST return ONLY a JSON object, no other text:
   {
     "products": [
       {
         "name": "Product Name",
         "description": "Brief description",
         "url": "https://productwebsite.com",
         "category": "Productivity",
         "metrics": {"likes": 0, "retweets": 0, "replies": 0, "views": 0},
         "post_url": "https://nitter.net/username/status/123456"
       }
     ]
   }

   IMPORTANT URL GUIDELINES:
   - "url": Product's official website/demo (NOT Nitter link)
   - "post_url": The Nitter post where you found this product
   - If no official website found, set "url" to empty string ""
   - Always provide "post_url" with the actual Nitter post link

Categories: 'Text Generation', 'Image Generation', 'Audio Generation', 'Video Generation', 'Productivity', 'Development', 'Other'

CRITICAL: Return ONLY the JSON object, no explanations or markdown."""

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
                
                # 检查是否已有默认设置，如果没有则插入
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
        print(f"加载分类设置失败: {e}")
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
        ],
        'custom': []
    }

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/api/search', methods=['POST'])
def search():
    """执行搜索任务"""
    data = request.json
    prompt = data.get('prompt', DEFAULT_PROMPT)
    
    # 创建任务
    task_result = create_browser_task(prompt)
    
    if not task_result or 'id' not in task_result:
        return jsonify({'error': '任务创建失败'}), 500
    
    task_id = task_result['id']
    live_url = task_result.get('live_url', '')
    
    # 如果创建时没有返回live_url，尝试获取
    if not live_url:
        max_retries = 10  # 增加到10次
        retry_interval = 3  # 每次等待3秒
        
        for attempt in range(1, max_retries + 1):
            print(f"[DEBUG] 获取live_url尝试 {attempt}/{max_retries}")
            time.sleep(retry_interval)
            
            task_detail = get_task_detail_from_api(task_id)
            if task_detail and 'live_url' in task_detail and task_detail['live_url']:
                live_url = task_detail['live_url']
                print(f"[DEBUG] 成功获取live_url: {live_url}")
                break
            else:
                print(f"[DEBUG] 第{attempt}次尝试未获取到live_url，继续重试...")
        
        if not live_url:
            print(f"[DEBUG] 经过{max_retries}次尝试仍未获取到live_url")
    
    # 返回任务信息，让前端轮询状态
    return jsonify({
        'task_id': task_id,
        'live_url': live_url,
        'status': 'created'
    })

@app.route('/api/task/<task_id>/status', methods=['GET'])
def task_status(task_id):
    """获取任务状态"""
    status = get_task_status_from_api(task_id)
    
    print(f"[DEBUG] 任务 {task_id} 状态: {status}")
    
    # 如果任务完成，获取详细结果
    if status in ['finished', 'failed', 'stopped']:
        result = get_task_detail_from_api(task_id)
        
        print(f"[DEBUG] 获取到任务详情，开始解析...")
        
        # 尝试解析结果中的JSON
        products_data = parse_task_result(result)
        
        print(f"[DEBUG] 解析完成，产品数量: {len(products_data.get('products', []))}")
        
        # 缓存结果
        search_cache[task_id] = {
            'status': status,
            'result': products_data,
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify({
            'status': status,
            'result': products_data,
            'live_url': result.get('live_url', '')
        })
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
        
        return jsonify({
            'status': status,
            'live_url': live_url
        })

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
            return jsonify({'success': True, 'message': '分类设置已重置为默认值', 'settings': default_settings})
        else:
            return jsonify({'error': '重置失败'}), 500
    except Exception as e:
        return jsonify({'error': f'重置分类设置时出错: {str(e)}'}), 500



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
    """解析任务结果，提取产品信息"""
    if not result:
        return None
    
    print(f"[DEBUG] 开始解析任务结果: {str(result)[:200]}...")
    
    # 尝试从结果中提取JSON数据
    # Browser-use API可能将结果放在不同的字段中
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
                            # 解析文本部分获取summary和note
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
                        
                elif isinstance(result[field], dict) and 'products' in result[field]:
                    print(f"[DEBUG] 字段已经是dict格式")
                    return result[field]
            except Exception as e:
                print(f"[DEBUG] 处理字段 '{field}' 时出错: {e}")
                continue
    
    # 如果没有找到JSON格式，尝试解析文本格式
    text_result = extract_text_from_result(result)
    if text_result:
        print(f"[DEBUG] 尝试文本解析")
        # 再次检查是否有嵌入的JSON
        json_data = extract_json_from_text(text_result)
        if json_data and 'products' in json_data:
            print(f"[DEBUG] 从文本中找到JSON")
            # 提取文本描述部分
            text_parts = text_result.split('{')[0].strip()
            if text_parts:
                text_data = parse_text_description(text_parts)
                json_data.update(text_data)
            return json_data
        
        # 纯文本解析
        print(f"[DEBUG] 使用纯文本解析")
        parsed_data = parse_text_result(text_result)
        if parsed_data and parsed_data.get('products'):
            return parsed_data
    
    # 如果没有找到结构化数据，返回空结果而不是原始结果
    print(f"[DEBUG] 未能解析出产品数据，返回空结果")
    return {'products': [], 'summary': '未能解析搜索结果', 'note': '', 'total_found': 0}

def extract_text_from_result(result):
    """从结果中提取文本内容"""
    if isinstance(result, str):
        return result
    
    # 检查常见的文本字段
    for field in ['result', 'output', 'data', 'response', 'content', 'message']:
        if field in result and isinstance(result[field], str):
            return result[field]
    
    return None

def extract_json_from_text(text):
    """从文本中提取JSON对象"""
    try:
        # 处理可能存在的 "json Copy" 或类似标记
        text = text.replace('json\nCopy\n', '').replace('json Copy\n', '').replace('```json', '').replace('```', '')
        
        # 查找JSON开始和结束的位置
        start_idx = text.find('{')
        if start_idx == -1:
            return None
            
        # 从开始位置查找匹配的结束括号
        brace_count = 0
        end_idx = start_idx
        
        for i in range(start_idx, len(text)):
            if text[i] == '{':
                brace_count += 1
            elif text[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_idx = i + 1
                    break
        
        if end_idx > start_idx:
            json_str = text[start_idx:end_idx]
            print(f"[DEBUG] 提取的JSON字符串: {json_str[:100]}...")
            parsed_json = json.loads(json_str)
            print(f"[DEBUG] 成功解析JSON，产品数量: {len(parsed_json.get('products', []))}")
            return parsed_json
    except Exception as e:
        print(f"[DEBUG] 提取JSON失败: {e}")
    
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

def parse_text_result(text):
    """解析文本格式的搜索结果"""
    products = []
    summary = ""
    note = ""
    
    try:
        # 提取搜索总结（第一段文字）
        lines = text.strip().split('\n')
        summary_lines = []
        product_lines = []
        note_lines = []
        
        # 分段解析
        current_section = "summary"
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if "Products Found:" in line:
                current_section = "products"
                continue
            elif line.startswith("All products are") or line.startswith("The search was"):
                current_section = "note"
                
            if current_section == "summary":
                summary_lines.append(line)
            elif current_section == "products":
                product_lines.append(line)
            elif current_section == "note":
                note_lines.append(line)
        
        # 构建总结
        summary = " ".join(summary_lines)
        note = " ".join(note_lines)
        
        # 解析产品信息
        for line in product_lines:
            line = line.strip()
            if not line:
                continue
                
            # 检查是否是产品描述行（包含 - 和分类）
            if ' - ' in line and ('(' in line and ')' in line):
                # 解析格式: "产品名 - 描述 (分类)"
                parts = line.split(' - ', 1)
                if len(parts) == 2:
                    name = parts[0].strip()
                    desc_and_category = parts[1].strip()
                    
                    # 提取分类（最后的括号内容）
                    if '(' in desc_and_category and ')' in desc_and_category:
                        last_paren = desc_and_category.rfind('(')
                        category = desc_and_category[last_paren+1:].replace(')', '').strip()
                        description = desc_and_category[:last_paren].strip()
                    else:
                        description = desc_and_category
                        category = 'Other'
                    
                    product = {
                        'name': name,
                        'description': description,
                        'url': '',  # 暂时为空，可以后续补充
                        'category': category,
                        'metrics': {'likes': 0, 'retweets': 0, 'replies': 0},
                        'post_url': ''
                    }
                    products.append(product)
        
        # 如果没有找到明确的分段，尝试其他解析方式
        if not products and "Products Found:" in text:
            product_section = text.split("Products Found:")[1]
            if "All products are" in product_section:
                product_part = product_section.split("All products are")[0]
                note = "All products are" + product_section.split("All products are")[1]
            else:
                product_part = product_section
                
            lines = product_part.strip().split('\n')
            
            for line in lines:
                line = line.strip()
                if line and ' - ' in line:
                    parts = line.split(' - ', 1)
                    if len(parts) == 2:
                        name = parts[0].strip()
                        desc = parts[1].strip()
                        
                        # 提取分类
                        category = 'Other'
                        if '(' in desc and ')' in desc:
                            last_paren = desc.rfind('(')
                            category = desc[last_paren+1:].replace(')', '').strip()
                            desc = desc[:last_paren].strip()
                        
                        product = {
                            'name': name,
                            'description': desc,
                            'url': '',
                            'category': category,
                            'metrics': {'likes': 0, 'retweets': 0, 'replies': 0},
                            'post_url': ''
                        }
                        products.append(product)
        
        result = {
            'products': products,
            'summary': summary,
            'note': note,
            'total_found': len(products)
        }
        
        print(f"[DEBUG] 解析到 {len(products)} 个产品，总结: {summary[:50]}...")
        return result
        
    except Exception as e:
        print(f"[DEBUG] 解析文本结果失败: {e}")
        return {'products': [], 'summary': text, 'note': '', 'total_found': 0}

if __name__ == '__main__':
    # 初始化数据库
    print("正在初始化数据库...")
    try:
        init_database()
        print("数据库初始化成功！")
    except Exception as e:
        print(f"数据库初始化失败: {e}")
        print("应用将继续运行，但分类管理功能可能无法正常工作")
    
    # 在生产环境中监听所有网络接口
    app.run(debug=False, host='0.0.0.0', port=3000) 