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

app = Flask(__name__)

# 配置
API_KEY = os.environ.get('BROWSER_USE_API_KEY', 'bu_MBkDV8V3engHO_xepEZzvXQvpR8_GK78487Kkmef014')
MODEL = "claude-sonnet-4-20250514"

# 默认的搜索Prompt - 简化版
DEFAULT_PROMPT = """You are an AI Product Discovery Expert. Find 2-3 newly launched AI products from startups on https://nitter.privacyredirect.com/ within 2025-06-01 to 2025-07-01.

Quick Search Strategy:
- Search: "AI app" launch since:2025-06-01 until:2025-07-01 -from:Google -from:Microsoft -from:OpenAI
- Find posts with product links (websites, demos)
- Extract only essential information

For each product found:
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

Keep it simple: Find 2-3 products maximum to complete task quickly."""

# 存储搜索结果的简单缓存
search_cache = {}

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
    # 在生产环境中监听所有网络接口
    app.run(debug=False, host='0.0.0.0', port=3000) 