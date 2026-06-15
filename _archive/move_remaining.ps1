$dest = "_archive"
Move-Item -Path "zhixue_qr.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "cleanup.js", "cleanup2.js", "cleanup3.js", "cleanup_final.js" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "quick_test.py", "ssh_connect.py", "start_server.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "upload_definitive.py", "upload_fix.py", "upload_fix_dbjs.py" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path "tencent_sensitive_words.txt", "_decrypted.txt" -Destination $dest -ErrorAction SilentlyContinue
Move-Item -Path ".git_commit_msg.txt", ".git_fix_author.sh" -Destination $dest -ErrorAction SilentlyContinue
Write-Host "补移完成"
