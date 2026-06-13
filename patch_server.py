# 按行号精确替换 server.js 中的 read/write 函数
# 行号来源: grep -n "function read\|function write\|const.*FILE\|const DATA_DIR"

with open('/www/wwwroot/campus-wall/server.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. 在第 6 行后添加 db require（在 cookie-parser require 后）
insert_line = None
for i, line in enumerate(lines):
    if "require('cookie-parser')" in line or 'require("cookie-parser")' in line:
        insert_line = i + 1
        break
if insert_line:
    lines.insert(insert_line, "const db = require('./db');\n")
    print(f'Inserted db require at line {insert_line+1}')

# 2. 替换函数定义的映射: {start_line_index: replacement_line}
# 行号基于 grep 输出，注意插入后行号会偏移 +1
replacements = {
    # readPosts (行183, 索引182)
    182: 'function readPosts() { return db.readPosts(); }\n',
    # writePosts (行197, 索引196)
    196: 'function writePosts(posts) { db.writePosts(posts); }\n',
    # readAdmins (行206, 索引205)
    205: 'function readAdmins() { return db.readAdmins(); }\n',
    # hasAdmins (行216, 索引215)
    215: 'function hasAdmins() { return fs.existsSync(DATA_DIR + \'/campus.db\') && db.readAdmins().length > 0; }\n',
    # writeAdmins (行223, 索引222)
    222: 'function writeAdmins(admins) { db.writeAdmins(admins); }\n',
    # readUsers (行506, 索引505)
    505: 'function readUsers() { return db.readUsers(); }\n',
    # writeUsers (行520, 索引519)
    519: 'function writeUsers(users) { db.writeUsers(users); }\n',
    # readTrustTokens (行532, 索引531)
    531: 'function readTrustTokens() { return db.readTrustTokens(); }\n',
    # writeTrustTokens (行546, 索引545)
    545: 'function writeTrustTokens(tokens) { db.writeTrustTokens(tokens); }\n',
    # readLogs (行555, 索引554)
    554: 'function readLogs() { return db.readLogs(); }\n',
    # writeLogs (行569, 索引568)
    568: 'function writeLogs(logs) { db.writeLogs(logs); }\n',
    # readReports (行2633, 索引2632)
    2632: 'function readReports() { return db.readReports(); }\n',
    # writeReports (行2647, 索引2646)
    2646: 'function writeReports(reports) { db.writeReports(reports); }\n',
    # readFeedbacks (行2659, 索引2658)
    2658: 'function readFeedbacks() { return db.readFeedbacks(); }\n',
    # writeFeedbacks (行2673, 索引2672)
    2672: 'function writeFeedbacks(feedbacks) { db.writeFeedbacks(feedbacks); }\n',
    # readBullying (行2683, 索引2682)
    2682: 'function readBullying() { return db.readBullying(); }\n',
    # writeBullying (行2697, 索引2696)
    2696: 'function writeBullying(data) { db.writeBullying(data); }\n',
    # readCreditLogs (行2706, 索引2705)
    2705: 'function readCreditLogs() { return db.readCreditLogs(); }\n',
    # writeCreditLogs (行2720, 索引2719)
    2719: 'function writeCreditLogs(logs) { db.writeCreditLogs(logs); }\n',
    # readCreditCards (行2730, 索引2729)
    2729: 'function readCreditCards() { return db.readCreditCards(); }\n',
    # writeCreditCards (行2743, 索引2742)
    2742: 'function writeCreditCards(cards) { db.writeCreditCards(cards); }\n',
    # readAnnouncement (行2806, 索引2805)
    2805: 'function readAnnouncement() { return db.readAnnouncement(); }\n',
    # writeAnnouncement (行2817, 索引2816)
    2816: 'function writeAnnouncement(data) { db.writeAnnouncement(data); }\n',
    # readDiscussions (行2826, 索引2825)
    2825: 'function readDiscussions() { return db.readDiscussions(); }\n',
    # writeDiscussions (行2840, 索引2839)
    2839: 'function writeDiscussions(discussions) { db.writeDiscussions(discussions); }\n',
    # readDiscussionComments (行2849, 索引2848)
    2848: 'function readDiscussionComments() { return db.readDiscussionComments(); }\n',
    # writeDiscussionComments (行2863, 索引2862)
    2862: 'function writeDiscussionComments(comments) { db.writeDiscussionComments(comments); }\n',
    # readQAQuestions (行3867, 索引3866)
    3866: 'function readQAQuestions() { return db.readQAQuestions(); }\n',
    # writeQAQuestions (行3873, 索引3872)
    3872: 'function writeQAQuestions(data) { db.writeQAQuestions(data); }\n',
    # readQAAnswers (行3876, 索引3875)
    3875: 'function readQAAnswers() { return db.readQAAnswers(); }\n',
    # writeQAAnswers (行3882, 索引3881)
    3881: 'function writeQAAnswers(data) { db.writeQAAnswers(data); }\n',
    # readPickupAuctions (行4291, 索引4290)
    4290: 'function readPickupAuctions() { return db.readPickupAuctions(); }\n',
    # writePickupAuctions (行4297, 索引4296)
    4296: 'function writePickupAuctions(data) { db.writePickupAuctions(data); }\n',
    # readPickupReports (行4300, 索引4299)
    4299: 'function readPickupReports() { return db.readPickupReports(); }\n',
    # writePickupReports (行4307, 索引4306)
    4306: 'function writePickupReports(data) { db.writePickupReports(data); }\n',
    # readSC (行4796, 索引4795)
    4795: 'function readSC() { return db.readSC(); }\n',
    # writeSC (行4803, 索引4802)
    4802: 'function writeSC(data) { db.writeSC(data); }\n',
    # readNotices (行4807, 索引4806)
    4806: 'function readNotices() { return db.readNotices(); }\n',
    # writeNotices (行4823, 索引4822)
    4822: 'function writeNotices(data) { db.writeNotices(data); }\n',
    # readPasskey (行5131, 索引5130)
    5130: 'function readPasskey() { return db.readPasskey(); }\n',
    # writePasskey (行5138, 索引5137)
    5137: 'function writePasskey(data) { db.writePasskey(data); }\n',
    # readApps (行5142, 索引5141)
    5141: 'function readApps() { return db.readApps(); }\n',
    # writeApps (行5149, 索引5148)
    5148: 'function writeApps(data) { db.writeApps(data); }\n',
}

# 需要删除的旧函数体（从 function 行到下一个非空白 function 或 app 路由之间的行）
# 范围映射: {start_idx: end_idx} (包含 end)
delete_ranges = []

def find_body_end(start_idx, lines):
    """从 function 行开始，找到函数体结束的行号"""
    # 跳过大括号内容，找到匹配的闭合大括号
    depth = 0
    in_func = False
    for i in range(start_idx, min(start_idx + 30, len(lines))):
        line = lines[i]
        if not in_func:
            if '{' in line:
                depth += line.count('{') - line.count('}')
                in_func = True
        else:
            depth += line.count('{') - line.count('}')
        if in_func and depth <= 0:
            return i + 1  # 闭合括号的下一行
    return start_idx + 1

for start_idx in sorted(replacements.keys()):
    # 找到旧函数体结束位置
    end_idx = find_body_end(start_idx, lines)
    # 记录要删除的行范围（不包括替换行本身）
    if end_idx > start_idx + 1:
        delete_ranges.append((start_idx + 1, end_idx))
        # 更新这行的内容（已通过 replacements 处理）

# 先替换函数定义行
for idx, new_line in replacements.items():
    lines[idx] = new_line

# 再从后往前删除旧函数体行（避免索引偏移）
delete_ranges.sort(key=lambda x: x[0], reverse=True)
for start, end in delete_ranges:
    del lines[start:end]

with open('/www/wwwroot/campus-wall/server.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f'Done. Modified {len(replacements)} functions, removed {sum(e-s for s,e in delete_ranges)} body lines.')
