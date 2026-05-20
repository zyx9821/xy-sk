// USDT (TRC20) 智能合约地址
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// 包含多功能面板的 HTML
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>夏雨在线收款监控系统</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f4f7f6; padding: 20px; color: #333; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        .tabs { margin-bottom: 20px; }
        .tabs button { background: #ecf0f1; border: none; padding: 10px 20px; cursor: pointer; font-size: 16px; border-radius: 5px 5px 0 0; }
        .tabs button.active { background: #3498db; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .status-success { color: #27ae60; font-weight: bold; }
        .btn { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin-top: 10px;}
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
        .card { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <h1>夏雨在线收款监控系统</h1>
        
        <div class="tabs">
            <button class="tab-btn active" onclick="switchTab('transactions')">交易监控</button>
            <button class="tab-btn" onclick="switchTab('account')">账户/合约查询</button>
            <button class="tab-btn" onclick="switchTab('settings')">系统设置</button>
        </div>

        <div id="transactions" class="tab-content active">
            <p>当前监控靓号: <strong id="display_address">加载中...</strong></p>
            <button class="btn" onclick="syncChain()">手动触发同步</button>
            <table id="txTable">
                <tr><th>交易哈希</th><th>打款人</th><th>金额 (USDT)</th><th>时间 (Asia/Shanghai)</th><th>状态</th></tr>
            </table>
        </div>

        <div id="account" class="tab-content">
            <div class="card">
                <h3>账户资产查询</h3>
                <p>USDT (TRC20) 余额: <strong id="usdt_balance" style="color:#e67e22; font-size: 1.2em;">加载中...</strong> USDT</p>
                <p>TRX 余额: <strong id="trx_balance">加载中...</strong> TRX</p>
                <button class="btn" onclick="loadAccountInfo()">刷新资产</button>
            </div>
            <div class="card">
                <h3>智能合约状态</h3>
                <p>USDT 官方合约: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t</p>
                <p>状态: <span style="color: green">运行正常</span> (基于 TronGrid)</p>
            </div>
        </div>

        <div id="settings" class="tab-content">
            <div class="card">
                <h3>修改配置</h3>
                <div class="form-group">
                    <label>监控波场靓号地址:</label>
                    <input type="text" id="set_address">
                </div>
                <div class="form-group">
                    <label>后台管理员账号:</label>
                    <input type="text" id="set_username">
                </div>
                <div class="form-group">
                    <label>后台管理员密码:</label>
                    <input type="text" id="set_password">
                </div>
                <button class="btn" onclick="saveSettings()">保存设置</button>
                <p style="color: #7f8c8d; font-size: 0.9em; margin-top:15px;">注: 定时任务频率请在 Cloudflare 后台 "Triggers" 中修改。</p>
            </div>
        </div>
    </div>

    <script>
        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            event.target.classList.add('active');
            if(tabId === 'account') loadAccountInfo();
        }

        async function initData() {
            // 获取设置
            const confRes = await fetch('/api/settings');
            const config = await confRes.json();
            document.getElementById('display_address').innerText = config.address || '未设置';
            document.getElementById('set_address').value = config.address || '';
            document.getElementById('set_username').value = config.username || '';
            document.getElementById('set_password').value = config.password || '';

            // 获取订单
            const res = await fetch('/api/orders');
            const data = await res.json();
            const table = document.getElementById('txTable');
            data.forEach(row => {
                const tr = table.insertRow();
                tr.innerHTML = \`<td><a href="https://tronscan.org/#/transaction/\${row.tx_hash}" target="_blank">\${row.tx_hash.substring(0,8)}...</a></td><td>\${row.from_address.substring(0,8)}...</td><td>\${row.amount}</td><td>\${new Date(row.created_at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}</td><td class="status-success">\${row.status}</td>\`;
            });
        }

        async function loadAccountInfo() {
            const address = document.getElementById('set_address').value;
            if(!address) return;
            document.getElementById('usdt_balance').innerText = "查询中...";
            try {
                const res = await fetch('/api/balance?address=' + address);
                const data = await res.json();
                document.getElementById('trx_balance').innerText = data.trx;
                document.getElementById('usdt_balance').innerText = data.usdt;
            } catch (e) {
                document.getElementById('usdt_balance').innerText = "查询失败";
            }
        }

        async function saveSettings() {
            const data = {
                address: document.getElementById('set_address').value,
                username: document.getElementById('set_username').value,
                password: document.getElementById('set_password').value
            };
            const res = await fetch('/api/settings', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if(res.ok) {
                alert('保存成功！');
                location.reload();
            } else {
                alert('保存失败');
            }
        }

        async function syncChain() {
            alert('后台已开始同步，请稍等几秒后刷新页面查看最新交易。');
            await fetch('/api/sync', {method: 'POST'});
            location.reload();
        }

        initData();
    </script>
</body>
</html>
`;

export default {
    // 1. 处理 HTTP 请求
    async fetch(request, env) {
        const url = new URL(request.url);

        // ==========================================
        // 【核心】自动初始化功能：建表与写入默认数据
        // ==========================================
        const isInit = await env.kv.get("system_initialized");
        if (!isInit) {
            // 自动执行 schema.sql 建表
            const createTableSql = `CREATE TABLE IF NOT EXISTS orders (
                tx_hash TEXT PRIMARY KEY,
                amount TEXT NOT NULL,
                from_address TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );`;
            await env.db.prepare(createTableSql).run();

            // 自动设置默认账号(admin)、密码(123456)和空靓号
            await env.kv.put("admin_username", "admin");
            await env.kv.put("admin_password", "123456");
            await env.kv.put("monitor_address", "请修改为你的极品靓号");
            await env.kv.put("system_initialized", "true");
        }

        // 登录请求处理
        if (url.pathname === "/login" && request.method === "POST") {
            const data = await request.formData();
            const realUsername = await env.kv.get("admin_username");
            const realPassword = await env.kv.get("admin_password");

            if (data.get("username") === realUsername && data.get("password") === realPassword) {
                const token = crypto.randomUUID();
                await env.kv.put("admin_token", token, { expirationTtl: 86400 });
                return new Response("Login Success", {
                    status: 302,
                    headers: { "Location": "/dashboard", "Set-Cookie": `token=${token}; HttpOnly; Path=/` }
                });
            }
            return new Response("账号或密码错误", { status: 401 });
        }

        // 登录页面
        if (url.pathname === "/") {
            return new Response(`
                <form action="/login" method="POST" style="margin: 100px auto; width: 300px; text-align: center; font-family: sans-serif;">
                    <h2>夏雨在线监控后台</h2>
                    <input name="username" placeholder="用户名 (默认admin)" required style="margin: 10px; padding: 10px; width: 80%; border-radius: 5px; border: 1px solid #ccc;"><br>
                    <input type="password" name="password" placeholder="密码 (默认123456)" required style="margin: 10px; padding: 10px; width: 80%; border-radius: 5px; border: 1px solid #ccc;"><br>
                    <button type="submit" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">安全登录</button>
                </form>
            `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // --- 以下路由需要鉴权 ---
        const cookie = request.headers.get("Cookie") || "";
        const tokenMatch = cookie.match(/token=([^;]+)/);
        const validToken = await env.kv.get("admin_token");
        if (!tokenMatch || tokenMatch[1] !== validToken) {
            return new Response("未授权访问，请先登录", { status: 302, headers: { "Location": "/" } });
        }

        // 仪表盘 HTML
        if (url.pathname === "/dashboard") {
            return new Response(dashboardHTML, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 获取数据库订单
        if (url.pathname === "/api/orders") {
            const { results } = await env.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50").all();
            return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        // 获取或保存设置
        if (url.pathname === "/api/settings") {
            if (request.method === "POST") {
                const data = await request.json();
                if (data.address) await env.kv.put("monitor_address", data.address);
                if (data.username) await env.kv.put("admin_username", data.username);
                if (data.password) await env.kv.put("admin_password", data.password);
                return new Response(JSON.stringify({ success: true }));
            } else {
                return new Response(JSON.stringify({
                    address: await env.kv.get("monitor_address"),
                    username: await env.kv.get("admin_username"),
                    password: await env.kv.get("admin_password")
                }), { headers: { "Content-Type": "application/json" } });
            }
        }

        // 查询波场账户资产
        if (url.pathname === "/api/balance") {
            const address = url.searchParams.get("address");
            if (!address) return new Response("Missing address", { status: 400 });
            try {
                // 调用波场官方 API 查询账户状态
                const res = await fetch(`https://api.trongrid.io/v1/accounts/${address}`);
                const json = await res.json();
                let trxBalance = 0;
                let usdtBalance = 0;
                if (json.data && json.data.length > 0) {
                    trxBalance = (json.data[0].balance || 0) / 1000000; // TRX 精度 6
                    const trc20 = json.data[0].trc20 || [];
                    for (let token of trc20) {
                        if (token[USDT_CONTRACT]) {
                            usdtBalance = parseInt(token[USDT_CONTRACT]) / 1000000;
                        }
                    }
                }
                return new Response(JSON.stringify({ trx: trxBalance, usdt: usdtBalance }), { headers: { "Content-Type": "application/json" } });
            } catch (e) {
                return new Response(JSON.stringify({ trx: 0, usdt: 0 }), { status: 500 });
            }
        }

        // 手动触发同步
        if (url.pathname === "/api/sync" && request.method === "POST") {
            await this.syncTronData(env);
            return new Response(JSON.stringify({ success: true }));
        }

        return new Response("404 Not Found", { status: 404 });
    },

    // 2. 处理定时触发器
    async scheduled(event, env, ctx) {
        ctx.waitUntil(this.syncTronData(env));
    },

    // 3. 核心监控逻辑
    async syncTronData(env) {
        try {
            const myAddress = await env.kv.get("monitor_address");
            if (!myAddress || myAddress === "请修改为你的极品靓号") return; // 没设置靓号不执行同步

            let minTimestamp = await env.kv.get("last_check_timestamp") || (Date.now() - 3600000); 
            
            const response = await fetch(`https://api.trongrid.io/v1/accounts/${myAddress}/transactions/trc20?contract_address=${USDT_CONTRACT}&min_timestamp=${minTimestamp}`);
            const json = await response.json();

            if (json.data && json.data.length > 0) {
                let newestTime = parseInt(minTimestamp);

                for (const tx of json.data) {
                    if (tx.to === myAddress) {
                        const amountUSDT = (parseInt(tx.value) / 1000000).toString();
                        // 写入数据库
                        await env.db.prepare(
                            "INSERT OR IGNORE INTO orders (tx_hash, amount, from_address) VALUES (?, ?, ?)"
                        ).bind(tx.transaction_id, amountUSDT, tx.from).run();
                    }
                    if (tx.block_timestamp > newestTime) newestTime = tx.block_timestamp;
                }
                await env.kv.put("last_check_timestamp", newestTime.toString());
            }
        } catch (error) {
            console.error("链上同步失败:", error);
        }
    }
};
