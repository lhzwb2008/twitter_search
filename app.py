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

app = Flask(__name__)

# 配置
API_KEY = os.environ.get('BROWSER_USE_API_KEY', 'bu_MBkDV8V3engHO_xepEZzvXQvpR8_GK78487Kkmef014')
MODEL = "claude-sonnet-4-20250514"

# 默认的搜索Prompt - 简化版
DEFAULT_PROMPT = """You are an AI Product Discovery Expert. Find 2-3 newly launched AI products from startups on https://nitter.privacyredirect.com/ within 2025-07-01 to 2025-07-20.

Quick Search Strategy:
- Search: "AI app" launch since:2025-07-01 until:2025-07-20 -from:Google -from:Microsoft -from:OpenAI
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
    
    # 如果任务完成，获取详细结果
    if status in ['finished', 'failed', 'stopped']:
        result = get_task_detail_from_api(task_id)
        
        # 尝试解析结果中的JSON
        products_data = parse_task_result(result)
        
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
        return response.json()
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
    
    # 尝试从结果中提取JSON数据
    # Browser-use API可能将结果放在不同的字段中
    for field in ['result', 'output', 'data', 'response']:
        if field in result:
            try:
                if isinstance(result[field], str):
                    # 尝试解析JSON字符串
                    data = json.loads(result[field])
                    if 'products' in data:
                        return data
                elif isinstance(result[field], dict) and 'products' in result[field]:
                    return result[field]
            except:
                continue
    
    # 如果没有找到结构化数据，返回原始结果
    return result

if __name__ == '__main__':
    # 在生产环境中监听所有网络接口
    app.run(debug=False, host='0.0.0.0', port=3000) 