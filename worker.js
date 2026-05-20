// USDT (TRC20) 智能合约地址
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
// 你的极品收款靓号
const MY_ADDRESS = "Tcxd你的极品靓号888";

// 简单的 HTML 面板 (夏雨在线监控台)
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>夏雨在线收款监控系统</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f4f7f6; padding: 20px; color: #333; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .status-success { color: #27ae60; font-weight: bold; }
        .btn { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="container">
        <h1>夏雨在线收款监控台</h1>
        <p>当前监控靓号: <strong>${MY_ADDRESS}</strong></p>
        <button class="btn" onclick="syncChain()">手动触发同步</button>
        <table id="txTable">
            <tr><th>交易哈希</th><th>打款人</th><th>金额 (USDT)</th><th>时间 (Asia/Shanghai)</th><th>状态</th></tr>
            </table>
    </div>
    <script>
        async function loadData() {
            const res = await fetch('/api/orders');
            const data = await res.json();
            const table = document.getElementById('txTable');
            data.forEach(row => {
                const tr = table.insertRow();
                tr.innerHTML = \`<td>\${row.tx_hash.substring(0,8)}...</td><td>\${row.from_address.substring(0,8)}...</td><td>\${row.amount}</td><td>\${new Date(row.created_at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}</td><td class="status-success">\${row.status}</td>\`;
            });
        }
        async function syncChain() {
            await fetch('/api/sync', {method: 'POST'});
            location.reload();
        }
        loadData();
    </script>
</body>
</html>
`;

export default {
    // 1. 处理 HTTP 访问 (后台管理界面)
    async fetch(request, env) {
        const url = new URL(request.url);

        // 简易密码验证逻辑
        if (url.pathname === "/login" && request.method === "POST") {
            const data = await request.formData();
            if (data.get("username") === "admin" && data.get("password") === "123456") {
                const token = crypto.randomUUID();
                await env.kv.put("admin_token", token, { expirationTtl: 86400 });
                return new Response("Login Success", {
                    status: 302,
                    headers: { "Location": "/dashboard", "Set-Cookie": \`token=\${token}; HttpOnly; Path=/\` }
                });
            }
            return new Response("登录失败", { status: 401 });
        }

        // 登录页面
        if (url.pathname === "/") {
            return new Response(`
                <form action="/login" method="POST" style="margin: 100px auto; width: 300px; text-align: center;">
                    <h2>监控后台登录</h2>
                    <input name="username" placeholder="用户名" required style="margin: 10px; padding: 8px;"><br>
                    <input type="password" name="password" placeholder="密码" required style="margin: 10px; padding: 8px;"><br>
                    <button type="submit" style="padding: 8px 20px;">登录</button>
                </form>
            `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 鉴权中间件校验
        const cookie = request.headers.get("Cookie") || "";
        const tokenMatch = cookie.match(/token=([^;]+)/);
        const validToken = await env.kv.get("admin_token");
        if (!tokenMatch || tokenMatch[1] !== validToken) {
            return new Response("未授权访问", { status: 302, headers: { "Location": "/" } });
        }

        // 后台仪表盘
        if (url.pathname === "/dashboard") {
            return new Response(dashboardHTML, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 获取数据库订单 API
        if (url.pathname === "/api/orders") {
            const { results } = await env.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50").all();
            return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        // 手动触发链上同步
        if (url.pathname === "/api/sync" && request.method === "POST") {
            await this.syncTronData(env);
            return new Response(JSON.stringify({ success: true }));
        }

        return new Response("404 Not Found", { status: 404 });
    },

    // 2. 处理定时触发器 (自动轮询)
    async scheduled(event, env, ctx) {
        ctx.waitUntil(this.syncTronData(env));
    },

    // 3. 核心监控逻辑 (对接波场节点与 D1)
    async syncTronData(env) {
        try {
            // 获取上次检查的最小时间戳 (避免重复抓取)
            let minTimestamp = await env.kv.get("last_check_timestamp") || (Date.now() - 3600000); 
            
            // 请求波场官方 API 抓取 USDT 进账记录
            const response = await fetch(\`https://api.trongrid.io/v1/accounts/\${MY_ADDRESS}/transactions/trc20?contract_address=\${USDT_CONTRACT}&min_timestamp=\${minTimestamp}\`);
            const json = await response.json();

            if (json.data && json.data.length > 0) {
                let newestTime = parseInt(minTimestamp);

                for (const tx of json.data) {
                    // 只处理别人转给我们的进账
                    if (tx.to === MY_ADDRESS) {
                        // USDT 精度转换 (除以 1,000,000)
                        const amountUSDT = (parseInt(tx.value) / 1000000).toString();
                        
                        // 插入 D1 数据库 (使用 INSERT OR IGNORE 防止重复写入)
                        await env.db.prepare(
                            "INSERT OR IGNORE INTO orders (tx_hash, amount, from_address) VALUES (?, ?, ?)"
                        ).bind(tx.transaction_id, amountUSDT, tx.from).run();

                        // 在这里可以触发 HTTP 请求给你的发卡网回调发货
                        // fetch('https://your-shop.com/api/callback', { ... })
                    }
                    if (tx.block_timestamp > newestTime) newestTime = tx.block_timestamp;
                }
                
                // 更新 KV 里的最新时间戳
                await env.kv.put("last_check_timestamp", newestTime.toString());
            }
        } catch (error) {
            console.error("链上同步失败:", error);
        }
    }
};
