#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Browser-use Cloud API Demo - 简化版
直接在代码中编辑任务prompt即可运行
"""

import requests
import json
import time

# ==================== 配置区域 ====================
# 您的Browser-use API密钥
API_KEY = "bu_MBkDV8V3engHO_xepEZzvXQvpR8_GK78487Kkmef014"

# 要执行的任务 - 在这里修改您的任务描述
TASK_PROMPT = """You are an AI Product Discovery Expert tasked with finding newly launched AI products/tools from startups or emerging creators on the mirror site https://nitter.net/ within the time window of 2025-07-01 to 2025-07-20.

Your Responsibilities:

Query Construction:
- Use keywords like 'AI app', 'AI product', 'new AI tool', 'AI startup', 'launch' with modifiers ('new', 'innovative', 'debut') and date filters (since:2025-07-01 until:2025-07-20).
- Target categories: Entertainment/Social (e.g., 'AI meme generator', 'AI avatar') and Productivity/Development (e.g., 'AI email assistant', 'AI code tool').
- Exclude posts from established companies (e.g., '-from:Google', '-from:Microsoft', '-OpenAI', '-Anthropic') and non-product content ('-update', '-version', '-feature').

Data Retrieval:
- Search https://nitter.net/ using its advanced search functionality to fetch posts matching the query within the specified date range (2025-07-01 to 2025-07-20).
- Apply engagement thresholds: min_faves, min_retweets, min_replies (if provided), as supported by Nitter's interface.

Filtering:
- Include only posts about new AI products from startups/emerging creators with verifiable links (e.g., product website, demo).
- Exclude posts about established companies, updates, or without clear product links.

Information Extraction:
For each valid post, extract:
- name: Product name (from post or linked site).
- description: Brief product description (max 50 words, from post or site).
- url: Official product website or demo link.
- category: One of: 'Text Generation', 'Image Generation', 'Audio Generation', 'Social/Entertainment', 'Productivity', 'Design', 'DevOps', 'Other'.
- metrics: {likes, retweets, replies} from the post, as available on Nitter.
- post_url: Link to the Nitter post (e.g., https://nitter.net/username/status/…).

Output Format:
Return a JSON object:
{
  "products": [
    {
      "name": "...",
      "description": "...",
      "url": "...",
      "category": "...",
      "metrics": {"likes": 0, "retweets": 0, "replies": 0, "views": 0},
      "post_url": "https://nitter.net/..."
    }
  ],
  "note": "Optional note if no products found"
}

Sort by engagement (likes + retweets) in descending order.
Limit to top 5 products unless specified otherwise.
If no products meet criteria, return an empty array with a note explaining why."""

# 使用的AI模型 (可选，留空使用默认模型)
# 可选值: gpt-4o-mini, gpt-4o, claude-3-7-sonnet, gemini-2.0-flash
MODEL = "claude-sonnet-4-20250514"

# 是否等待任务完成
WAIT_FOR_COMPLETION = True

# 超时时间(秒) - 设置为0表示无超时限制
TIMEOUT = 0
# ==================== 配置区域结束 ====================


def create_task(task_prompt: str, model: str = None) -> dict:
    """创建新的浏览器自动化任务"""
    url = "https://api.browser-use.com/api/v1/run-task"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {"task": task_prompt}
    if model:
        data["llm_model"] = model
    
    try:
        print(f"🚀 正在创建任务...")
        print(f"📝 任务描述: {task_prompt}")
        if model:
            print(f"🤖 使用模型: {model}")
        
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ 任务创建成功!")
        print(f"🆔 任务ID: {result.get('id')}")
        
        if 'live_url' in result:
            live_url = result['live_url']
            print(f"🔗 实时预览: {live_url}")
            print(f"💡 您可以在浏览器中打开上述链接，实时观看AI执行任务的每一步操作！")
            print(f"📺 这是一个完整的虚拟浏览器界面，支持VNC协议，可以看到鼠标移动、点击、输入等所有操作")
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"❌ 创建任务失败: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
                print(f"📋 错误详情: {json.dumps(error_detail, indent=2, ensure_ascii=False)}")
            except:
                print(f"📋 响应内容: {e.response.text}")
        return {}


def get_task_status(task_id: str) -> dict:
    """获取任务状态"""
    url = f"https://api.browser-use.com/api/v1/task/{task_id}/status"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ 获取任务状态失败: {e}")
        return {}


def get_task_detail(task_id: str) -> dict:
    """获取任务详细信息"""
    url = f"https://api.browser-use.com/api/v1/task/{task_id}"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ 获取任务详情失败: {e}")
        return {}


def wait_for_completion(task_id: str, timeout: int = TIMEOUT) -> dict:
    """等待任务完成"""
    start_time = time.time()
    print(f"⏳ 等待任务完成...")
    if timeout > 0:
        print(f"⏰ 超时时间: {timeout}秒")
    else:
        print("⏰ 无超时限制，将持续等待直到任务完成")
    
    while True:
        # 如果设置了超时时间且已超时，则退出
        if timeout > 0 and time.time() - start_time > timeout:
            print(f"⏰ 任务超时 ({timeout}秒)")
            return {}
        
        status = get_task_status(task_id)
        
        if not status:
            time.sleep(5)
            continue
        
        # 根据API文档，状态API返回的是字符串
        current_status = status
        elapsed_time = int(time.time() - start_time)
        print(f"📊 当前状态: {current_status} (已运行 {elapsed_time}秒)")
        
        # 根据文档，完成状态是 finished，不是 completed 
        if current_status in ['finished', 'failed', 'stopped']:
            print(f"🏁 任务结束，最终状态: {current_status}")
            return get_task_detail(task_id)
        
        time.sleep(5)


def main():
    """主函数"""
    print("=" * 60)
    print("🌐 Browser-use Cloud API Demo")
    print("=" * 60)
    
    # 检查配置
    if not API_KEY or API_KEY == "your_api_key_here":
        print("❌ 请在文件顶部配置您的Browser-use API密钥")
        return
    
    if not TASK_PROMPT:
        print("❌ 请在文件顶部配置任务描述 (TASK_PROMPT)")
        return
    
    # 创建任务
    result = create_task(TASK_PROMPT, MODEL)
    
    if not result or 'id' not in result:
        print("❌ 任务创建失败")
        return
    
    task_id = result['id']
    
    # 立即获取任务详情以显示live_url（如果创建时没有返回）
    if 'live_url' not in result or not result.get('live_url'):
        # 多次尝试获取实时预览链接，因为可能需要时间生成
        max_retries = 5
        retry_interval = 3  # 秒
        
        for attempt in range(1, max_retries + 1):
            print(f"🔍 获取任务详情... (尝试 {attempt}/{max_retries})")
            task_detail = get_task_detail(task_id)
            
            if task_detail and 'live_url' in task_detail and task_detail['live_url']:
                live_url = task_detail['live_url']
                print(f"✅ 成功获取实时预览链接!")
                print(f"🔗 实时预览: {live_url}")
                print(f"💡 您可以在浏览器中打开上述链接，实时观看AI执行任务的每一步操作！")
                print(f"📺 这是一个完整的虚拟浏览器界面，支持VNC协议，可以看到鼠标移动、点击、输入等所有操作")
                break
            else:
                if attempt < max_retries:
                    print(f"⏳ 实时预览链接尚未生成，{retry_interval}秒后重试...")
                    time.sleep(retry_interval)
                
    
    # 等待任务完成
    if WAIT_FOR_COMPLETION:
        final_result = wait_for_completion(task_id)
        if final_result:
            print(f"\n🎉 任务完成结果:")
            print(json.dumps(final_result, indent=2, ensure_ascii=False))
            
            # 再次提醒用户可以查看实时预览
            if 'live_url' in final_result:
                print(f"\n📺 想要回看任务执行过程？")
                print(f"🔗 访问: {final_result['live_url']}")
                print(f"💡 这个链接可以让您回看整个任务的执行过程，包括每一步的操作细节")
    else:
        print(f"\n📋 任务已创建，ID: {task_id}")
        print("💡 您可以访问 https://cloud.browser-use.com 查看任务进度")
        
        # 获取任务详情以显示live_url
        task_detail = get_task_detail(task_id)
        if task_detail and 'live_url' in task_detail:
            print(f"🔗 实时预览: {task_detail['live_url']}")
            print(f"📺 您可以实时观看任务执行过程！")


if __name__ == "__main__":
    # 检查是否安装了requests库
    try:
        import requests
    except ImportError:
        print("❌ 缺少requests库，请运行: pip install requests")
        exit(1)
    
    main() 