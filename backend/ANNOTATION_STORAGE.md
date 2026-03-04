# 批注笔记文件存储功能

## 功能概述

批注笔记（highlights）现在会自动保存到后端数据库和Markdown文件中，不再仅依赖localStorage。

## 实现细节

### 1. 数据库模型 (models.py)

在 `Note` 表中添加了 `color` 字段用于存储批注颜色：
- `color`: VARCHAR(50) - 批注颜色 (yellow/green/blue/pink/purple)

### 2. 后端API (routers/notes.py)

批注和普通笔记共用 `/api/notes` 接口，通过 `note_type` 字段区分：
- `note_type: "note"` - 普通笔记
- `note_type: "highlight"` - 批注笔记

**创建批注**:
```
POST /api/notes
{
  "paper_id": 1,
  "content": "",
  "selected_text": "引用的原文",
  "page_number": 5,
  "note_type": "highlight",
  "color": "yellow",
  "position_data": {
    "rects": [...],
    "pageYOffset": 25.5
  }
}
```

**更新批注笔记**:
```
PUT /api/notes/{note_id}
{
  "content": "我的笔记内容",
  "color": "green"
}
```

**删除批注**:
```
DELETE /api/notes/{note_id}
```

### 3. 文件存储 (services/paper_fs_service.py)

批注保存为Markdown文件，位置：`backend/data/papers/{paper_id}/notes/`

**文件命名**: `note_{timestamp}_{page}.md`

**文件内容示例**:
```markdown
---
note_id: 123
note_type: highlight
page: 5
created: 20260228_143022
title: Untitled
color: yellow
---

## 引用原文

> This is the selected text from the paper

我的批注笔记内容
```

### 4. 前端集成 (pages/ReaderPage.tsx)

- **创建批注**: `handleCreateHighlight` 调用 `createNote` API
- **更新笔记**: `handleUpdateNote` 调用 `updateNote` API
- **删除批注**: `handleDeleteHighlight` 调用 `deleteNote` API
- 操作成功后自动触发文件列表刷新

### 5. 数据迁移

运行迁移脚本添加color字段：
```bash
cd backend
python migrate_add_color.py
```

## 使用流程

1. 用户在PDF阅读器中选择文本并创建批注
2. 前端调用 `createNote` API，传入批注信息
3. 后端保存到数据库并生成Markdown文件
4. 文件保存在 `data/papers/{paper_id}/notes/` 目录
5. 前端触发文件列表刷新，用户可以看到新创建的笔记文件

## 注意事项

- 批注ID格式：`note-{backend_id}` (例如: `note-123`)
- 临时ID格式：`hl-{timestamp}-{random}` (创建时使用，保存后替换为backend ID)
- 批注和普通笔记共用同一个数据表和API
- 文件会在更新时删除旧文件并创建新文件
