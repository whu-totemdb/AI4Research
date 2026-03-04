#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API 端点测试脚本
测试 AI4Research 后端的关键 API 端点
"""
import requests
import json
import sys
import io

# 设置标准输出编码为 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://localhost:8000"

def test_endpoint(method, path, data=None, description=""):
    """测试单个端点"""
    url = f"{BASE_URL}{path}"
    print(f"\n{'='*60}")
    print(f"测试: {description}")
    print(f"请求: {method} {path}")

    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=10)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, timeout=10)
        else:
            print(f"❌ 不支持的方法: {method}")
            return False

        print(f"状态码: {response.status_code}")

        if response.status_code < 400:
            print(f"✅ 成功")
            # 只显示响应的前200个字符
            content = response.text[:200]
            if len(response.text) > 200:
                content += "..."
            print(f"响应预览: {content}")
            return True
        else:
            print(f"❌ 失败")
            print(f"错误信息: {response.text}")
            return False

    except Exception as e:
        print(f"❌ 异常: {str(e)}")
        return False

def main():
    print("开始测试 AI4Research API 端点")
    print(f"基础 URL: {BASE_URL}")

    results = []

    # 测试论文相关端点
    results.append(test_endpoint("GET", "/api/papers", description="获取所有论文列表"))
    results.append(test_endpoint("GET", "/api/papers/1", description="获取单篇论文详情"))
    results.append(test_endpoint("GET", "/api/papers/1/markdown", description="获取论文 Markdown 内容"))
    results.append(test_endpoint("GET", "/api/papers/1/summary", description="获取论文摘要"))

    # 测试文件夹相关端点
    results.append(test_endpoint("GET", "/api/folders", description="获取所有文件夹"))
    results.append(test_endpoint("GET", "/api/folders/tree", description="获取文件夹树结构"))

    # 测试设置相关端点
    results.append(test_endpoint("GET", "/api/settings", description="获取系统设置"))

    # 测试健康检查
    results.append(test_endpoint("GET", "/health", description="健康检查"))

    # 统计结果
    print(f"\n{'='*60}")
    print("测试总结")
    print(f"{'='*60}")
    total = len(results)
    passed = sum(results)
    failed = total - passed

    print(f"总计: {total} 个端点")
    print(f"✅ 成功: {passed}")
    print(f"❌ 失败: {failed}")
    print(f"成功率: {passed/total*100:.1f}%")

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
