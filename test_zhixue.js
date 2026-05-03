/**
 * 快速测试智学网登录模块
 * 用法：node test_zhixue.js <账号> <密码>
 */
const { loginZhixue } = require('./zhixue');

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.log('用法：node test_zhixue.js <智学网账号> <密码>');
  process.exit(1);
}

(async () => {
  console.log('[test] 开始测试智学网登录...');
  console.log('[test] 账号：', username);
  try {
    const info = await loginZhixue(username, password);
    console.log('✅ 登录成功！获取到的信息：');
    console.log('  姓名：', info.realName || '（未获取到）');
    console.log('  学校：', info.schoolName || '（未获取到）');
    console.log('  班级：', info.className || '（未获取到）');
    console.log('  学生ID：', info.studentId || '（未获取到）');
  } catch (e) {
    console.error('❌ 登录失败：', e.message);
    process.exit(1);
  }
})();
