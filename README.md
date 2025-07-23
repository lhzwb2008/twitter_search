# AI产品Twitter搜索工具

这是一个基于Browser-use API的Web应用，用于从Twitter/Nitter搜索和发现最新的AI产品和工具。

## 功能特点

- 🔍 **智能搜索**：使用自定义Prompt在Nitter上搜索AI产品
- 📊 **结构化展示**：将搜索结果以卡片形式展示，包含产品名称、描述、分类和社交指标
- ✏️ **Prompt编辑**：支持自定义和编辑搜索Prompt
- 🔗 **实时预览**：提供任务执行过程的实时预览链接
- 📱 **响应式设计**：适配各种设备屏幕

## 技术栈

- **后端**：Python Flask
- **前端**：原生HTML/CSS/JavaScript
- **API**：Browser-use Cloud API

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置API密钥

在 `app.py` 中设置您的Browser-use API密钥，或通过环境变量设置：

```bash
export BROWSER_USE_API_KEY="your_api_key_here"
```

### 3. 运行应用

```bash
python app.py
```

应用将在 http://localhost:3000 启动

## 使用说明

1. **编辑搜索Prompt**：在文本框中编辑搜索提示词，定义搜索条件
2. **开始搜索**：点击"开始搜索"按钮执行任务
3. **查看进度**：通过实时预览链接观看AI执行搜索的过程
4. **查看结果**：搜索完成后，结果将以卡片形式展示

## 项目结构

```
twitter_search/
├── app.py              # Flask应用主文件
├── browser_use_demo.py # 原始的命令行演示脚本
├── templates/          # HTML模板
│   └── index.html
├── static/             # 静态资源
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── requirements.txt    # Python依赖
├── .gitignore         # Git忽略文件
└── README.md          # 项目说明
```

## API端点

- `GET /` - 主页
- `GET /api/prompt` - 获取默认搜索Prompt
- `POST /api/search` - 创建搜索任务
- `GET /api/task/<task_id>/status` - 获取任务状态

## 注意事项

- Browser-use API需要有效的API密钥
- 搜索任务可能需要几分钟才能完成
- 建议定期检查API使用额度

## 许可证

MIT License 