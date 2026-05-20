// USDT (TRC20) 智能合约地址
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// 包含多功能面板的 HTML
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>夏雨在线收款监控系统 (多账号版)</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f4f7f6; padding: 20px; color: #333; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        .tabs { margin-bottom: 20px; }
        .tabs button { background: #ecf0f1; border: none; padding: 10px 20px; cursor: pointer; font-size: 16px; border-radius: 5px 5px 0 0; }
        .tabs button.active { background: #3498db; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .status-success { color: #27ae60; font-weight: bold; }
        .btn { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin-top: 10px;}
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group textarea { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; }
        .card { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #eee; }
        .address-tag { display: inline-block; background: #e8f4f8; color: #2980b9; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>夏雨在线多账号监控台</h1>
        
        <div class="tabs">
            <button class="tab-btn active" onclick="switchTab('transactions')">交易监控</button>
            <button class="tab-btn" onclick="switchTab('account')">资产汇总</button>
            <button class="tab-btn" onclick="switchTab('settings')">系统设置</button>
        </div>

        <div id="transactions" class="tab-content active">
            <button class="btn" onclick="syncChain()">手动触发同步</button>
            <table id="txTable">
                <tr><th>交易哈希</th><th>收款靓号 (To)</th><th>打款人 (From)</th><th>金额 (USDT)</th><th>时间 (Asia/Shanghai)</th><th>状态</th></tr>
            </table>
        </div>

        <div id="account" class="tab-content">
            <div class="card">
                <h3>各靓号资产查询</h3>
                <button class="btn" onclick="loadAccountInfo()" style="margin-bottom:15px;">刷新所有资产</button>
                <div id="balances_container"></div>
            </div>
        </div>

        <div id="settings" class="tab-content">
            <div class="card">
                <h3>修改配置</h3>
                <div class="form-group">
                    <label>监控波场靓号地址 (每行一个，支持无限个):</label>
                    <textarea id="set_addresses" rows="6" placeholder="输入波场地址，每行一个..."></textarea>
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
            document.getElementById('set_addresses').value = config.addresses.join('\\n');
            document.getElementById('set_username').value = config.username || '';
            document.getElementById('set_password').value = config.password || '';

            // 获取订单
            const res = await fetch('/api/orders');
            const data = await res.json();
            const table = document.getElementById('txTable');
            data.forEach(row => {
                const tr = table.insertRow();
                const toAddr = row.to_address ? \`<span class="address-tag">\${row.to_address.substring(0,8)}...</span>\` : '-';
                tr.innerHTML = \`<td><a href="https://tronscan.org/#/transaction/\${row.tx_hash}" target="_blank">\${row.tx_hash.substring(0,8)}...</a></td><td>\${toAddr}</td><td>\${row.from_address.substring(0,8)}...</td><td><strong style="color:#e67e22;">\${row.amount}</strong></td><td>\${new Date(row.created_at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}</td><td class="status-success">\${row.status}</td>\`;
            });
        }

        async function loadAccountInfo() {
            const container = document.getElementById('balances_container');
            container.innerHTML = '查询中，请稍候...';
            
            const addresses = document.getElementById('set_addresses').value.split('\\n').map(a => a.trim()).filter(a => a);
            if(addresses.length === 0) {
                container.innerHTML = '暂未配置监控地址';
                return;
            }

            let html = '<table style="width:100%; border-collapse: collapse;"><tr><th style="border-bottom:1px solid #ddd; padding:8px; text-align:left;">地址</th><th style="border-bottom:1px solid #ddd; padding:8px; text-align:left;">USDT 余额</th><th style="border-bottom:1px solid #ddd; padding:8px; text-align:left;">TRX 余额</th></tr>';
            
            for(let addr of addresses) {
                try {
                    const res = await fetch('/api/balance?address=' + addr);
                    const data = await res.json();
                    html += \`<tr><td style="padding:8px; border-bottom:1px solid #eee; font-family:monospace;">\${addr}</td><td style="padding:8px; border-bottom:1px solid #eee; color:#e67e22; font-weight:bold;">\${data.usdt}</td><td style="padding:8px; border-bottom:1px solid #eee;">\${data.trx}</td></tr>\`;
                } catch (e) {
                    html += \`<tr><td style="padding:8px; border-bottom:1px solid #eee;">\${addr}</td><td colspan="2" style="padding:8px; border-bottom:1px solid #eee; color:red;">查询失败</td></tr>\`;
                }
            }
            html += '</table>';
            container.innerHTML = html;
        }

        async function saveSettings() {
            const addresses = document.getElementById('set_addresses').value.split('\\n').map(a => a.trim()).filter(a => a);
            const data = {
                addresses: addresses,
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
            alert('后台已开始循环同步所有账号，请稍等几秒后刷新页面查看最新交易。');
            await fetch('/api/sync', {method: 'POST'});
            location.reload();
        }

        initData();
    </script>
</body>
</html>
`;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ==========================================
        // 【核心】自动初始化与表结构热更新
        // ==========================================
        const isInit = await env.kv.get("system_initialized_v2");
        if (!isInit) {
            // 建表
            await env.db.prepare(`CREATE TABLE IF NOT EXISTS orders (
                tx_hash TEXT PRIMARY KEY,
                amount TEXT NOT NULL,
                from_address TEXT NOT NULL,
                to_address TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );`).run();
            
            // 尝试热更新老表，增加 to_address 字段 (如果字段已存在会报错，catch 忽略即可)
            try {
                await env.db.prepare("ALTER TABLE orders ADD COLUMN to_address TEXT").run();
            } catch (e) { /* 老表可能已经有这个字段了，或者由于某些限制忽略 */ }

            // 初始化默认数据 (改存数组格式)
            await env.kv.put("admin_username", "admin");
            await env.kv.put("admin_password", "123456");
            await env.kv.put("monitor_addresses", JSON.stringify(["填写靓号1", "填写靓号2"]));
            await env.kv.put("system_initialized_v2", "true");
        }

        // 登录逻辑
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

        if (url.pathname === "/") {
            return new Response(`
                <form action="/login" method="POST" style="margin: 100px auto; width: 300px; text-align: center; font-family: sans-serif;">
                    <h2>多账号监控后台</h2>
                    <input name="username" placeholder="用户名" required style="margin: 10px; padding: 10px; width: 80%; border-radius: 5px; border: 1px solid #ccc;"><br>
                    <input type="password" name="password" placeholder="密码" required style="margin: 10px; padding: 10px; width: 80%; border-radius: 5px; border: 1px solid #ccc;"><br>
                    <button type="submit" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">安全登录</button>
                </form>
            `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // --- 鉴权 ---
        const cookie = request.headers.get("Cookie") || "";
        const tokenMatch = cookie.match(/token=([^;]+)/);
        const validToken = await env.kv.get("admin_token");
        if (!tokenMatch || tokenMatch[1] !== validToken) {
            return new Response("未授权", { status: 302, headers: { "Location": "/" } });
        }

        // 仪表盘
        if (url.pathname === "/dashboard") {
            return new Response(dashboardHTML, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 获取订单
        if (url.pathname === "/api/orders") {
            const { results } = await env.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").all();
            return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        // 获取/保存设置 (处理数组)
        if (url.pathname === "/api/settings") {
            if (request.method === "POST") {
                const data = await request.json();
                if (data.addresses && Array.isArray(data.addresses)) {
                    await env.kv.put("monitor_addresses", JSON.stringify(data.addresses));
                }
                if (data.username) await env.kv.put("admin_username", data.username);
                if (data.password) await env.kv.put("admin_password", data.password);
                return new Response(JSON.stringify({ success: true }));
            } else {
                const addrsStr = await env.kv.get("monitor_addresses");
                let addresses = [];
                try { addresses = JSON.parse(addrsStr); } catch(e) {}
                
                return new Response(JSON.stringify({
                    addresses: addresses,
                    username: await env.kv.get("admin_username"),
                    password: await env.kv.get("admin_password")
                }), { headers: { "Content-Type": "application/json" } });
            }
        }

        // 查询单账户资产
        if (url.pathname === "/api/balance") {
            const address = url.searchParams.get("address");
            if (!address) return new Response("Missing address", { status: 400 });
            try {
                const res = await fetch(`https://api.trongrid.io/v1/accounts/${address}`);
                const json = await res.json();
                let trxBalance = 0;
                let usdtBalance = 0;
                if (json.data && json.data.length > 0) {
                    trxBalance = (json.data[0].balance || 0) / 1000000;
                    const trc20 = json.data[0].trc20 || [];
                    for (let token of trc20) {
                        if (token[USDT_CONTRACT]) usdtBalance = parseInt(token[USDT_CONTRACT]) / 1000000;
                    }
                }
                return new Response(JSON.stringify({ trx: trxBalance, usdt: usdtBalance }), { headers: { "Content-Type": "application/json" } });
            } catch (e) {
                return new Response(JSON.stringify({ trx: 0, usdt: 0 }), { status: 500 });
            }
        }

        // 手动同步
        if (url.pathname === "/api/sync" && request.method === "POST") {
            await this.syncTronData(env);
            return new Response(JSON.stringify({ success: true }));
        }

        return new Response("404 Not Found", { status: 404 });
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(this.syncTronData(env));
    },

    // 3. 多账号轮询同步逻辑
    async syncTronData(env) {
        try {
            const addrsStr = await env.kv.get("monitor_addresses");
            if (!addrsStr) return;
            
            let addresses = [];
            try { addresses = JSON.parse(addrsStr); } catch(e) {}
            
            // 过滤掉未填写的占位符
            addresses = addresses.filter(addr => addr && !addr.includes("填写靓号"));
            if (addresses.length === 0) return;

            // 获取上次拉取的时间戳，作为基准
            let minTimestamp = await env.kv.get("last_check_timestamp") || (Date.now() - 3600000); 
            let globalNewestTime = parseInt(minTimestamp);

            // 遍历每个监控地址
            for (const myAddress of addresses) {
                try {
                    const response = await fetch(`https://api.trongrid.io/v1/accounts/${myAddress}/transactions/trc20?contract_address=${USDT_CONTRACT}&min_timestamp=${minTimestamp}`);
                    const json = await response.json();

                    if (json.data && json.data.length > 0) {
                        for (const tx of json.data) {
                            // 确保是别人打进当前遍历的靓号
                            if (tx.to === myAddress) {
                                const amountUSDT = (parseInt(tx.value) / 1000000).toString();
                                // 写入 D1，这里增加了 to_address 的绑定
                                await env.db.prepare(
                                    "INSERT OR IGNORE INTO orders (tx_hash, amount, from_address, to_address) VALUES (?, ?, ?, ?)"
                                ).bind(tx.transaction_id, amountUSDT, tx.from, tx.to).run();
                            }
                            if (tx.block_timestamp > globalNewestTime) {
                                globalNewestTime = tx.block_timestamp;
                            }
                        }
                    }
                } catch (subErr) {
                    console.error(`地址 ${myAddress} 同步失败:`, subErr);
                    // 继续循环下一个地址，不中断整体流程
                }
            }
            
            // 更新全局的最后检查时间
            if (globalNewestTime > parseInt(minTimestamp)) {
                await env.kv.put("last_check_timestamp", globalNewestTime.toString());
            }
        } catch (error) {
            console.error("整体链上同步任务失败:", error);
        }
    }
};
