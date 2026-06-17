$dest = "_archive"

# 批量: check_*
Move-Item -Path "check_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: fix_*
Move-Item -Path "fix_*.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "fix_*.js" -Destination $dest -ErrorAction SilentlyContinue

# 批量: debug_*
Move-Item -Path "debug_*.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "debug_*.js" -Destination $dest -ErrorAction SilentlyContinue

# 批量: test_*
Move-Item -Path "test_*.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "test_*.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "test_*.mjs" -Destination $dest -ErrorAction SilentlyContinue

# 批量: sync_*
Move-Item -Path "sync_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: run_*
Move-Item -Path "run_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: verify_*
Move-Item -Path "verify_*.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "verify_*.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "verify_*.txt" -Destination $dest -ErrorAction SilentlyContinue

# 批量: restart_*
Move-Item -Path "restart_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: patch_*
Move-Item -Path "patch_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: repatch_*
Move-Item -Path "repatch_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: read_*
Move-Item -Path "read_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: final_*
Move-Item -Path "final_verify*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: git_*
Move-Item -Path "git_commit*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: find_node*
Move-Item -Path "find_node*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: delete_*
Move-Item -Path "delete_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 批量: deploy_*
Move-Item -Path "deploy_*.py" -Destination $dest -ErrorAction SilentlyContinue

# 零散脚本
Move-Item -Path "download_backup.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "backup_server.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "create_missing_tables.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "dedup_functions.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "analyze_server.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "resolve_conflict.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "restore_server.py" -Destination $dest -ErrorAction SilentlyContinue

# 下划线开头的js
Move-Item -Path "_check_syntax.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "_extracted.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "_find_error.js" -Destination $dest -ErrorAction SilentlyContinue

# 零散js
Move-Item -Path "apply_patch_local.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "add_auto_flag.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "add_target_userid.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "check_pwd.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "screenshot.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "verify_user_admin.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "fix_html.js" -Destination $dest -ErrorAction SilentlyContinue

# zhixue相关一次性文件
Move-Item -Path "zhixue_qr.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "zhixue_qr_login.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "zhixue_helper.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "debug_zhixue.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "zhixue_debug_1.png" -Destination $dest -ErrorAction SilentlyContinue

# 调试html
Move-Item -Path "debug_guide.html" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "analyze_zhixue_login.html" -Destination $dest -ErrorAction SilentlyContinue

# txt
Move-Item -Path "pytest.txt" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "verify_output.txt" -Destination $dest -ErrorAction SilentlyContinue

# 目录
Move-Item -Path "guide_test" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "guide_v2" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "test_screenshots" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "backup" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path ".workbuddy" -Destination $dest -ErrorAction SilentlyContinue

Write-Host "=== 全部转移完成 ==="
