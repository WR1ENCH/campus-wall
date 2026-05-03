/**
 * 测试智学网登录功能
 * 使用方法：node test_zhixue.js
 * 然后输入账号密码
 */

const { loginZhixue } = require('./zhixue');

async function test() {
  console.log('='.repeat(50));
  console.log('智学网登录测试');
  console.log('='.repeat(50));
  console.log();
  
  // 从命令行参数获取账号密码，或提示输入
  const username = process.argv[2];
  const password = process.argv[3];
  
  if (!username || !password) {
    console.log('使用方法：');
    console.log('  node test_zhixue.js <账号> <密码>');
    console.log();
    console.log('示例：');
    console.log('  node test_zhixue.js 123456 password123');
    console.log();
    console.log('提示：浏览器会弹出，请完成人机验证！');
    process.exit(1);
  }
  
  console.log(`账号: ${username}`);
  console.log(`密码: ${'*'.repeat(password.length)}`);
  console.log();
  console.log('浏览器即将打开，请完成人机验证...');
  console.log();
  
  try {
    const startTime = Date.now();
    const userInfo = await loginZhixue(username, password);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log();
    console.log('='.repeat(50));
    console.log('登录成功！');
    console.log('='.repeat(50));
    console.log();
    console.log('用户信息：');
    console.log(`  姓名: ${userInfo.realName || '未获取到'}`);
    console.log(`  学校: ${userInfo.schoolName || '未获取到'}`);
    console.log(`  班级: ${userInfo.className || '未获取到'}`);
    console.log(`  年级: ${userInfo.gradeName || '未获取到'}`);
    console.log();
    console.log(`耗时: ${duration}秒`);
    console.log();
    
    // 输出JSON格式结果
    console.log('JSON格式：');
    console.log(JSON.stringify(userInfo, null, 2));
    
  } catch (error) {
    console.error();
    console.error('='.repeat(50));
    console.error('登录失败！');
    console.error('='.repeat(50));
    console.error();
    console.error('错误信息：', error.message);
    console.error();
    process.exit(1);
  }
}

test();
