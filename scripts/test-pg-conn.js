// 测试 PostgreSQL 连接
// 尝试不同的连接方式
const postgres = require('postgres');

async function test() {
  // 方式1: 标准 TCP 连接
  try {
    console.log('方式1: TCP 连接 (无密码)...');
    const sql1 = postgres('postgresql://postgres@localhost:5432/postgres', { max: 2 });
    const r1 = await sql1`SELECT 1 AS ok`;
    console.log('  成功:', r1);
    await sql1.end();
    return;
  } catch (e) {
    console.log('  失败:', e.message);
  }

  // 方式2: 使用 pipe 路径
  try {
    console.log('方式2: 命名管道连接...');
    const sql2 = postgres({
      path: '\\\\.\\pipe\\PostgreSQL',
      port: 5432,
      user: 'postgres',
      database: 'postgres',
      max: 2,
    });
    const r2 = await sql2`SELECT 1 AS ok`;
    console.log('  成功:', r2);
    await sql2.end();
    return;
  } catch (e) {
    console.log('  失败:', e.message);
  }

  // 方式3: TCP 连接带空密码
  try {
    console.log('方式3: TCP 连接 (空密码)...');
    const sql3 = postgres('postgresql://postgres:@localhost:5432/postgres', { max: 2 });
    const r3 = await sql3`SELECT 1 AS ok`;
    console.log('  成功:', r3);
    await sql3.end();
    return;
  } catch (e) {
    console.log('  失败:', e.message);
  }

  // 方式4: 使用 127.0.0.1
  try {
    console.log('方式4: TCP 连接 127.0.0.1 (无密码)...');
    const sql4 = postgres('postgresql://postgres@127.0.0.1:5432/postgres', { max: 2 });
    const r4 = await sql4`SELECT 1 AS ok`;
    console.log('  成功:', r4);
    await sql4.end();
    return;
  } catch (e) {
    console.log('  失败:', e.message);
  }
}

test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });