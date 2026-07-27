// ===== routes/newbie-task.js - 新手任务系统 =====
const { verifyUserToken } = require('../lib/crypto');
const db = require('../db');
const { generateId } = require('../lib/uniqueId');

// ===== 任务定义 =====
const NEWBIE_TASKS = [
  { id: 'visit_own_profile', name: '访问用户主页', reward: 20, type: 'self_profile' },
  { id: 'mbti_test', name: '进行MBTI测评', reward: 30, type: 'mbti' },
  { id: 'view_notifications', name: '查看通知', reward: 15, type: 'notifications' },
  { id: 'create_post', name: '发帖', reward: 30, type: 'post' },
  { id: 'like_post', name: '点赞别人的帖子', reward: 15, type: 'like' },
  { id: 'comment_post', name: '评论别人帖子', reward: 20, type: 'comment' },
  { id: 'join_discussion', name: '参与一次话题讨论', reward: 25, type: 'discussion' },
  { id: 'view_qa', name: '查看你问我答窗口', reward: 15, type: 'qa' },
  { id: 'view_auction', name: '查看校园墙拍卖窗口', reward: 15, type: 'auction' },
  { id: 'cast_vote', name: '完成一次投票', reward: 25, type: 'vote' },
  { id: 'send_whisper', name: '发送一次悄悄话', reward: 20, type: 'whisper' },
  { id: 'do_search', name: '完成一次搜索', reward: 15, type: 'search' },
  { id: 'visit_other_profile', name: '查看一次别人的用户主页', reward: 20, type: 'other_profile' },
];

// ===== 阶段奖励定义 =====
const STAGE_REWARDS = [
  { stage: 1, threshold: 3, name: '初识校园', reward: { type: 'credit', amount: 50, desc: '50 Credit' } },
  { stage: 2, threshold: 7, name: '渐入佳境', reward: { type: 'credit', amount: 100, desc: '100 Credit' } },
  { stage: 3, threshold: 10, name: '探索达人', reward: { type: 'credit', amount: 150, desc: '150 Credit' } },
  { stage: 4, threshold: 13, name: '校园达人', reward: { type: 'plus', days: 3, desc: '3天PLUS++资格' } },
];

// ===== 辅助函数 =====

function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readCreditLogs() { return db.readCreditLogs(); }
function writeCreditLogs(logs) { db.writeCreditLogs(logs); }
function readSubscriptions() { return db.readSubscriptions(); }
function writeSubscriptions(subs) { db.writeSubscriptions(subs); }

function getTaskById(taskId) {
  return NEWBIE_TASKS.find(t => t.id === taskId);
}

function getStageReward(stage) {
  return STAGE_REWARDS.find(s => s.stage === stage);
}

function activateTrialSubscription(userId, days) {
  const now = new Date();
  const startTime = now.toISOString();
  const endTime = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString();

  const sub = {
    id: generateId('SUBS'),
    userId,
    plan: 'trial',
    startTime,
    endTime,
    price: 0,
    paymentMethod: 'reward',
    cardCode: null,
    status: 'active',
    renewedFrom: null,
    createdAt: startTime
  };

  db.addSubscription(sub);
  return sub;
}

// ===== 路由 =====
module.exports = function(app) {
  // 获取新手任务进度
  app.get('/api/user/newbie-task/progress', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    let progress = db.getNewbieTaskProgress(session.id);
    
    // 初始化进度
    if (!progress) {
      progress = {
        userId: session.id,
        tasks: '{}',
        stageRewardsClaimed: '[]',
        completedAt: null,
        createdAt: new Date().toISOString()
      };
      db.insertNewbieTaskProgress(progress);
    }

    const tasks = typeof progress.tasks === 'string' ? JSON.parse(progress.tasks || '{}') : (progress.tasks || {});
    const stageRewardsClaimed = typeof progress.stageRewardsClaimed === 'string' ? JSON.parse(progress.stageRewardsClaimed || '[]') : (progress.stageRewardsClaimed || []);
    const totalTasks = NEWBIE_TASKS.length;
    const completedTasks = Object.values(tasks).filter(Boolean).length;
    const completed = completedTasks === totalTasks && stageRewardsClaimed.length === STAGE_REWARDS.length;

    // 计算当前阶段
    let currentStage = 0;
    for (const sr of STAGE_REWARDS) {
      if (completedTasks >= sr.threshold) currentStage = sr.stage;
    }

    res.json({
      ok: true,
      data: {
        tasks,
        stageRewardsClaimed,
        completed,
        totalTasks,
        completedTasks,
        currentStage
      }
    });
  });

  // 标记任务完成
  app.post('/api/user/newbie-task/complete', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const { taskId } = req.body || {};
    if (!taskId) return res.json({ ok: false, msg: '缺少任务ID', code: 'MISSING_TASK_ID' });

    const task = getTaskById(taskId);
    if (!task) return res.json({ ok: false, msg: '任务不存在', code: 'TASK_NOT_FOUND' });

    let progress = db.getNewbieTaskProgress(session.id);
    if (!progress) {
      progress = {
        userId: session.id,
        tasks: '{}',
        stageRewardsClaimed: '[]',
        completedAt: null,
        createdAt: new Date().toISOString()
      };
      db.insertNewbieTaskProgress(progress);
    }

    const tasks = typeof progress.tasks === 'string' ? JSON.parse(progress.tasks || '{}') : (progress.tasks || {});
    if (tasks[taskId]) {
      return res.json({ ok: false, msg: '任务已完成', code: 'TASK_ALREADY_COMPLETED' });
    }

    // 标记任务完成
    tasks[taskId] = true;
    const completedTasks = Object.values(tasks).length;
    const totalTasks = NEWBIE_TASKS.length;

    // 更新进度
    db.updateNewbieTaskProgress(session.id, {
      tasks: JSON.stringify(tasks)
    });

    // 发放任务奖励（Credit）
    const users = readUsers();
    const userIdx = users.findIndex(u => u.id === session.id);
    if (userIdx !== -1) {
      users[userIdx].credit = (users[userIdx].credit || 0) + task.reward;
      writeUsers(users);
    }

    // 记录流水
    const logs = readCreditLogs();
    logs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id,
      amount: task.reward,
      reason: '新手任务：' + task.name,
      createdAt: new Date().toISOString()
    });
    writeCreditLogs(logs);

    res.json({
      ok: true,
      data: {
        taskId,
        reward: task.reward,
        credit: (users[userIdx]?.credit || 0),
        completedTasks,
        totalTasks
      }
    });
  });

  // 领取阶段奖励
  app.post('/api/user/newbie-task/claim-stage-reward', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const { stage } = req.body || {};
    if (!stage) return res.json({ ok: false, msg: '缺少阶段参数', code: 'MISSING_STAGE' });

    const stageReward = getStageReward(Number(stage));
    if (!stageReward) return res.json({ ok: false, msg: '阶段不存在', code: 'STAGE_NOT_FOUND' });

    let progress = db.getNewbieTaskProgress(session.id);
    if (!progress) return res.json({ ok: false, msg: '无任务进度记录', code: 'NO_PROGRESS' });

    const tasks = typeof progress.tasks === 'string' ? JSON.parse(progress.tasks || '{}') : (progress.tasks || {});
    const stageRewardsClaimed = typeof progress.stageRewardsClaimed === 'string' ? JSON.parse(progress.stageRewardsClaimed || '[]') : (progress.stageRewardsClaimed || []);
    const completedTasks = Object.values(tasks).filter(Boolean).length;

    // 验证是否已领取
    if (stageRewardsClaimed.includes(Number(stage))) {
      return res.json({ ok: false, msg: '奖励已领取', code: 'ALREADY_CLAIMED' });
    }

    // 验证是否达到门槛
    if (completedTasks < stageReward.threshold) {
      return res.json({ ok: false, msg: '未达到领取条件', code: 'THRESHOLD_NOT_MET' });
    }

    // 发放奖励
    if (stageReward.reward.type === 'credit') {
      const users = readUsers();
      const userIdx = users.findIndex(u => u.id === session.id);
      if (userIdx !== -1) {
        users[userIdx].credit = (users[userIdx].credit || 0) + stageReward.reward.amount;
        writeUsers(users);
      }

      // 记录流水
      const logs = readCreditLogs();
      logs.push({
        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId: session.id,
        amount: stageReward.reward.amount,
        reason: '新手任务阶段奖励：' + stageReward.name,
        createdAt: new Date().toISOString()
      });
      writeCreditLogs(logs);
    } else if (stageReward.reward.type === 'plus') {
      // 激活 PLUS++ 试用
      activateTrialSubscription(session.id, stageReward.reward.days);
    }

    // 标记已领取
    stageRewardsClaimed.push(Number(stage));
    db.updateNewbieTaskProgress(session.id, {
      stageRewardsClaimed: JSON.stringify(stageRewardsClaimed)
    });

    res.json({
      ok: true,
      data: {
        stage: Number(stage),
        reward: stageReward.reward
      }
    });
  });
};
