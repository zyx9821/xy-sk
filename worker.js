// 1. 核心：导入外部 HTML 模块
import dashboardHTML from "./admin.html";

// USDT (TRC20) 智能合约地址
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ==========================================
        // 初始化与建表
        // ==========================================
        const isInit = await env.kv.get("system_init_v3");
        if (!isInit) {
            await env.db.prepare(`CREATE TABLE IF NOT EXISTS orders (
                tx_hash TEXT PRIMARY KEY,
                amount TEXT NOT NULL,
                from_address TEXT NOT NULL,
                to_address TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );`).run();
            try { await env.db.prepare("ALTER TABLE orders ADD COLUMN to_address TEXT").run(); } catch (e) { }

            await env.kv.put("admin_username", "admin");
            await env.kv.put("admin_password", "123456");
            await env.kv.put("monitor_addresses", JSON.stringify(["填写你的波场靓号"]));
            await env.kv.put("webhook_configs", JSON.stringify([])); 
            await env.kv.put("system_init_v3", "true");
        }

        // 登录逻辑
        if (url.pathname === "/login" && request.method === "POST") {
            const data = await request.formData();
            if (data.get("username") === await env.kv.get("admin_username") && data.get("password") === await env.kv.get("admin_password")) {
                const token = crypto.randomUUID();
                await env.kv.put("admin_token", token, { expirationTtl: 86400 });
                return new Response("Login Success", { status: 302, headers: { "Location": "/dashboard", "Set-Cookie": `token=${token}; HttpOnly; Path=/` } });
            }
            return new Response("账号或密码错误", { status: 401 });
        }

        if (url.pathname === "/") {
            return new Response(`
                <form action="/login" method="POST" style="margin: 100px auto; width: 300px; text-align: center; font-family: sans-serif;">
                    <h2>监控矩阵后台登录</h2>
                    <input name="username" placeholder="用户名" required style="margin: 10px; padding: 10px; width: 80%; border-radius: 5px; border: 1px solid #ccc;"><br>
                    <input type="password" name="password" placeholder="密码" required style="margin: 10px; padding: 10px; width: 80%; border-radius: 5px; border: 1px solid #ccc;"><br>
                    <button type="submit" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">登录</button>
                </form>
            `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 鉴权
        const cookie = request.headers.get("Cookie") || "";
        const tokenMatch = cookie.match(/token=([^;]+)/);
        if (!tokenMatch || tokenMatch[1] !== await env.kv.get("admin_token")) {
            return new Response("未授权", { status: 302, headers: { "Location": "/" } });
        }

        // 直接返回导入的 HTML
        if (url.pathname === "/dashboard") return new Response(dashboardHTML, { headers: { "Content-Type": "text/html;charset=UTF-8" } });

        if (url.pathname === "/api/orders") {
            const { results } = await env.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").all();
            return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        // 基础设置读写
        if (url.pathname === "/api/settings") {
            if (request.method === "POST") {
                const data = await request.json();
                if (data.addresses) await env.kv.put("monitor_addresses", JSON.stringify(data.addresses));
                if (data.username) await env.kv.put("admin_username", data.username);
                if (data.password) await env.kv.put("admin_password", data.password);
                return new Response(JSON.stringify({ success: true }));
            } else {
                return new Response(JSON.stringify({
                    addresses: JSON.parse(await env.kv.get("monitor_addresses") || "[]"),
                    username: await env.kv.get("admin_username"),
                    password: await env.kv.get("admin_password")
                }), { headers: { "Content-Type": "application/json" } });
            }
        }

        // Webhooks 路由读写
        if (url.pathname === "/api/webhooks") {
            if (request.method === "POST") {
                const data = await request.json();
                await env.kv.put("webhook_configs", JSON.stringify(data));
                return new Response(JSON.stringify({ success: true }));
            } else {
                const whData = await env.kv.get("webhook_configs") || "[]";
                return new Response(whData, { headers: { "Content-Type": "application/json" } });
            }
        }

        if (url.pathname === "/api/sync" && request.method === "POST") {
            await this.syncTronData(env);
            return new Response(JSON.stringify({ success: true }));
        }

        return new Response("404 Not Found", { status: 404 });
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(this.syncTronData(env));
    },

    async syncTronData(env) {
        try {
            const addrsStr = await env.kv.get("monitor_addresses");
            let addresses = [];
            try { addresses = JSON.parse(addrsStr); } catch(e) {}
            addresses = addresses.filter(addr => addr && !addr.includes("填写"));
            if (addresses.length === 0) return;

            let webhooks = [];
            try { webhooks = JSON.parse(await env.kv.get("webhook_configs") || "[]"); } catch(e) {}

            let minTimestamp = await env.kv.get("last_check_timestamp") || (Date.now() - 3600000); 
            let globalNewestTime = parseInt(minTimestamp);

            for (const myAddress of addresses) {
                try {
                    const response = await fetch(`https://api.trongrid.io/v1/accounts/${myAddress}/transactions/trc20?contract_address=${USDT_CONTRACT}&min_timestamp=${minTimestamp}`);
                    const json = await response.json();

                    if (json.data && json.data.length > 0) {
                        for (const tx of json.data) {
                            if (tx.to === myAddress) {
                                const amountUSDT = (parseInt(tx.value) / 1000000).toString();
                                
                                const dbRes = await env.db.prepare(
                                    "INSERT OR IGNORE INTO orders (tx_hash, amount, from_address, to_address) VALUES (?, ?, ?, ?)"
                                ).bind(tx.transaction_id, amountUSDT, tx.from, tx.to).run();

                                if (dbRes.meta.changes > 0 && webhooks.length > 0) {
                                    for (const wh of webhooks) {
                                        if (!wh.enabled || !wh.url || !wh.secret) continue;
                                        const binds = wh.binds.split(',').map(s => s.trim());
                                        
                                        if (binds.includes('*') || binds.includes(tx.to)) {
                                            const signText = `${tx.transaction_id}${amountUSDT}${wh.secret}`;
                                            const msgBuffer = new TextEncoder().encode(signText);
                                            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                                            const signHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                                            fetch(wh.url, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    tx_hash: tx.transaction_id,
                                                    amount: amountUSDT,
                                                    from_address: tx.from,
                                                    to_address: tx.to,
                                                    sign: signHex,
                                                    timestamp: tx.block_timestamp
                                                })
                                            }).catch(e => console.error("Webhook 通知分发失败:", e));
                                        }
                                    }
                                }
                            }
                            if (tx.block_timestamp > globalNewestTime) {
                                globalNewestTime = tx.block_timestamp;
                            }
                        }
                    }
                } catch (subErr) {
                    console.error(`靓号 ${myAddress} 同步异常:`, subErr);
                }
            }
            
            if (globalNewestTime > parseInt(minTimestamp)) {
                await env.kv.put("last_check_timestamp", globalNewestTime.toString());
            }
        } catch (error) {
            console.error("整体链上同步任务失败:", error);
        }
    }
};
