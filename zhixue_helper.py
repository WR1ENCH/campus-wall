#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智学网查询助手 - 供Node.js调用
接收命令行参数：用户名 密码
输出JSON格式结果到stdout
"""

import sys
import json
import os

def main():
    """主函数：登录智学网并获取用户信息"""
    
    # 检查参数
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "message": "缺少参数：需要用户名和密码"
        }, ensure_ascii=False))
        sys.exit(1)
    
    username = sys.argv[1]
    password = sys.argv[2]
    
    try:
        # 导入智学网库
        from zhixuewang import login_playwright
        from zhixuewang.account import StudentAccount, TeacherAccount
        
        # 输出进度（到stderr，不影响JSON输出）
        print(json.dumps({"status": "logging_in", "message": "正在登录..."}), file=sys.stderr)
        
        # 登录（会弹出浏览器窗口，需要手动完成人机验证）
        user = login_playwright(username, password)
        
        print(json.dumps({"status": "login_success", "message": "登录成功"}), file=sys.stderr)
        
        # 构建结果
        result = {
            "success": True,
            "message": "登录成功",
            "data": {
                "name": user.name,
            }
        }
        
        # 根据账号类型获取不同信息
        if isinstance(user, StudentAccount):
            result["data"]["type"] = "student"
            
            # 获取学校信息
            if hasattr(user, 'clazz') and hasattr(user.clazz, 'school'):
                result["data"]["school"] = user.clazz.school.name
                result["data"]["class"] = user.clazz.name
                if hasattr(user.clazz, 'grade'):
                    result["data"]["grade"] = user.clazz.grade.name
            
            # 尝试获取成绩
            try:
                scores = user.get_scores()
                if scores and len(scores) > 0:
                    result["data"]["scores"] = []
                    for score in scores[:10]:  # 只取前10条
                        score_info = {}
                        if hasattr(score, 'exam_name'):
                            score_info["exam"] = str(score.exam_name)
                        if hasattr(score, 'score'):
                            score_info["score"] = str(score.score)
                        if hasattr(score, 'subject'):
                            score_info["subject"] = str(score.subject)
                        result["data"]["scores"].append(score_info)
            except Exception as e:
                print(f"获取成绩失败: {e}", file=sys.stderr)
                result["data"]["scores_error"] = str(e)
                
        elif isinstance(user, TeacherAccount):
            result["data"]["type"] = "teacher"
            if hasattr(user, 'school'):
                result["data"]["school"] = user.school.name if hasattr(user.school, 'name') else str(user.school)
            if hasattr(user, 'subject'):
                result["data"]["subject"] = str(user.subject)
        
        # 输出JSON结果（到stdout）
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        # 输出错误（到stdout，保持JSON格式）
        print(json.dumps({
            "success": False,
            "message": str(e)
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
