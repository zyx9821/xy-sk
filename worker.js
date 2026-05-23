// worker.js
import dashboardHTML from "./admin.html";

// 全链 USDT 合约与 RPC 节点配置
const NETWORKS = {
    TRON: { type: 'tron', usdt: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
    ETH:  { type: 'evm', rpc: 'https://cloudflare-eth.com', usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    BSC:  { type: 'evm', rpc: 'https://bsc-dataseed.binance.org', usdt: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
    AVAX: { type: 'evm', rpc: 'https://api.avax.network/ext/bc/C/rpc', usdt: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', decimals: 6 }
};
// EVM ERC20 Transfer 事件的 Keccak-256 签名
const EVM_TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ==========================================
        // 1. 系统初始化与建表 (升级到 v4)
        // ==========================================
        const isInit = await env.kv.get("system_init_v4");
        if (!isInit) {
            await env.db.prepare(`CREATE TABLE IF NOT EXISTS orders (
                tx_hash TEXT, network TEXT NOT NULL, amount TEXT NOT NULL,
                from_address TEXT NOT NULL, to_address TEXT, status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tx_hash, network)
            );`).run();
            await env.kv.put("admin_username", "admin");
            await env.kv.put("admin_password", "123456");
            await env.kv.put("system_init_v4", "true");
        }

        // ==========================================
        // 2. 登录与鉴权路由
        // ==========================================
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
            return new Response(`<form action="/login" method="POST" style="margin: 100px auto; width: 300px; text-align: center; font-family: sans-serif;"><h2>全链矩阵登录</h2><input name="username" placeholder="用户名" required style="margin: 10px; padding: 10px; width: 80%;"><br><input type="password" name="password" placeholder="密码" required style="margin: 10px; padding: 10px; width: 80%;"><br><button type="submit" style="padding: 10px 20px; background: #3498db; color: white; border: none;">登录</button></form>`, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        const cookie = request.headers.get("Cookie") || "";
        const tokenMatch = cookie.match(/token=([^;]+)/);
        if (!tokenMatch || tokenMatch[1] !== await env.kv.get("admin_token")) return new Response("未授权", { status: 302, headers: { "Location": "/" } });

        // ==========================================
        // 3. API 与页面路由
        // ==========================================
        if (url.pathname === "/dashboard") return new Response(dashboardHTML, { headers: { "Content-Type": "text/html;charset=UTF-8" } });

        if (url.pathname === "/api/orders") {
            const { results } = await env.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").all();
            return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }
        // --- 新增：收款地址 CRUD 接口 ---
        if (url.pathname === "/api/addresses") {
            if (request.method === "GET") {
                const { results } = await env.db.prepare("SELECT * FROM addresses ORDER BY created_at DESC").all();
                return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
            }
            if (request.method === "POST") {
                const data = await request.json();
                await env.db.prepare("INSERT INTO addresses (name, address, icon, remark) VALUES (?, ?, ?, ?)").bind(data.name, data.address, data.icon, data.remark).run();
                return new Response(JSON.stringify({ success: true }));
            }
            if (request.method === "DELETE") {
                const urlObj = new URL(request.url);
                const id = urlObj.searchParams.get("id");
                await env.db.prepare("DELETE FROM addresses WHERE id = ?").bind(id).run();
                return new Response(JSON.stringify({ success: true }));
            }
            if (request.method === "PUT") {
                const data = await request.json();
                await env.db.prepare("UPDATE addresses SET name=?, address=?, icon=?, remark=? WHERE id=?").bind(data.name, data.address, data.icon, data.remark, data.id).run();
                return new Response(JSON.stringify({ success: true }));
            }
        }

        if (url.pathname === "/api/settings") {
            if (request.method === "POST") {
                const data = await request.json();
                if (data.username) await env.kv.put("admin_username", data.username);
                if (data.password) await env.kv.put("admin_password", data.password);
                return new Response(JSON.stringify({ success: true }));
            }
            return new Response(JSON.stringify({
                username: await env.kv.get("admin_username"), 
                password: await env.kv.get("admin_password")
            }), { headers: { "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/webhooks") {
            if (request.method === "GET") {
                const { results } = await env.db.prepare("SELECT * FROM webhooks ORDER BY created_at DESC").all();
                return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
            }
            if (request.method === "POST") {
                const data = await request.json();
                await env.db.prepare("INSERT INTO webhooks (name, url, secret, binds, icon, remark) VALUES (?, ?, ?, ?, ?, ?)").bind(data.name, data.url, data.secret, data.binds, data.icon, data.remark).run();
                return new Response(JSON.stringify({ success: true }));
            }
            if (request.method === "DELETE") {
                const urlObj = new URL(request.url);
                const id = urlObj.searchParams.get("id");
                await env.db.prepare("DELETE FROM webhooks WHERE id = ?").bind(id).run();
                return new Response(JSON.stringify({ success: true }));
            }
            if (request.method === "PUT") {
                const urlObj = new URL(request.url);
                const id = urlObj.searchParams.get("id");
                const status = urlObj.searchParams.get("status");
                if (status !== null) {
                    await env.db.prepare("UPDATE webhooks SET enabled = ? WHERE id = ?").bind(status === "1" ? 1 : 0, id).run();
                } else {
                    const data = await request.json();
                    await env.db.prepare("UPDATE webhooks SET name=?, url=?, secret=?, binds=?, icon=?, remark=? WHERE id=?").bind(data.name, data.url, data.secret, data.binds, data.icon, data.remark, data.id).run();
                }
                return new Response(JSON.stringify({ success: true }));
            }
        }

        // 手动触发全链同步
        if (url.pathname === "/api/sync" && request.method === "POST") {
            await this.syncAllChainsData(env);
            return new Response(JSON.stringify({ success: true }));
        }

        return new Response("404 Not Found", { status: 404 });
    },

    // 定时器入口
    async scheduled(event, env, ctx) {
        ctx.waitUntil(this.syncAllChainsData(env));
    },

    // ==========================================
    // 4. 全链并发抓取核心引擎
    // ==========================================
    async syncAllChainsData(env) {
        try {
            // 从 D1 数据库动态提取所有已激活的监控地址
            const { results } = await env.db.prepare("SELECT address FROM addresses").all();
            const addresses = results.map(row => row.address).filter(a => a);
            if (addresses.length === 0) return;

            // 从 D1 关系型数据库提取当前处于激活状态(enabled=1)的外部业务回调路由节点
            const { results: webhooks } = await env.db.prepare("SELECT * FROM webhooks WHERE enabled = 1").all();

            // 地址分类路由
            const tronAddrs = addresses.filter(a => a.startsWith("T"));
            const evmAddrs = addresses.filter(a => a.startsWith("0x"));

            // 构造异步任务数组，让所有链并发执行
            const syncTasks = [];

            // 1. 装载 TRON 任务
            if (tronAddrs.length > 0) {
                syncTasks.push(this.syncTronNetwork(env, tronAddrs, webhooks));
            }
            // 2. 装载 EVM 任务 (ETH, BSC, AVAX)
            if (evmAddrs.length > 0) {
                syncTasks.push(this.syncEVMNetwork(env, 'ETH', NETWORKS.ETH, evmAddrs, webhooks));
                syncTasks.push(this.syncEVMNetwork(env, 'BSC', NETWORKS.BSC, evmAddrs, webhooks));
                syncTasks.push(this.syncEVMNetwork(env, 'AVAX', NETWORKS.AVAX, evmAddrs, webhooks));
            }

            // 并发执行所有链的扫块
            await Promise.allSettled(syncTasks);

        } catch (error) {
            console.error("整体引擎运行失败:", error);
        }
    },

    // --- EVM 扫块核心 ---
    async syncEVMNetwork(env, netName, netConfig, addresses, webhooks) {
        try {
            // 获取链上最新区块
            const blockRes = await fetch(netConfig.rpc, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
            });
            const blockData = await blockRes.json();
            const latestBlock = parseInt(blockData.result, 16);

            // 读取上次扫描的区块，默认扫前 50 个区块防遗漏
            let lastCheckBlock = parseInt(await env.kv.get(`last_block_${netName}`) || (latestBlock - 50));
            
            // 如果间隔太大（如首次运行），限制最大跨度为 800 个区块，防止公共 RPC 报错
            if (latestBlock - lastCheckBlock > 800) lastCheckBlock = latestBlock - 800;
            if (latestBlock <= lastCheckBlock) return; 

            for (const addr of addresses) {
                const paddedAddr = "0x000000000000000000000000" + addr.replace("0x", "").toLowerCase();
                const payload = {
                    jsonrpc: "2.0", id: 1, method: "eth_getLogs",
                    params: [{
                        fromBlock: "0x" + lastCheckBlock.toString(16),
                        toBlock: "0x" + latestBlock.toString(16),
                        address: netConfig.usdt,
                        topics: [EVM_TRANSFER_SIG, null, paddedAddr]
                    }]
                };

                const rpcRes = await fetch(netConfig.rpc, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const logsData = await rpcRes.json();

                if (logsData.result && logsData.result.length > 0) {
                    for (const log of logsData.result) {
                        const txHash = log.transactionHash;
                        const fromAddr = "0x" + log.topics[1].slice(26);
                        const rawAmount = parseInt(log.data, 16);
                        const amountUSDT = (rawAmount / Math.pow(10, netConfig.decimals)).toString();

                        await this.saveAndNotify(env, {
                            network: netName, txHash, amount: amountUSDT, fromAddr, toAddr: addr.toLowerCase(), timestamp: Date.now()
                        }, webhooks);
                    }
                }
            }
            await env.kv.put(`last_block_${netName}`, latestBlock.toString());
        } catch (e) { console.error(`${netName} 同步异常:`, e); }
    },

    // --- 波场 TRON 同步核心 ---
    async syncTronNetwork(env, addresses, webhooks) {
        let minTimestamp = parseInt(await env.kv.get("last_check_tron") || (Date.now() - 3600000));
        let globalNewestTime = minTimestamp;

        for (const myAddress of addresses) {
            try {
                const response = await fetch(`https://api.trongrid.io/v1/accounts/${myAddress}/transactions/trc20?contract_address=${NETWORKS.TRON.usdt}&min_timestamp=${minTimestamp}`);
                const json = await response.json();

                if (json.data && json.data.length > 0) {
                    for (const tx of json.data) {
                        if (tx.to === myAddress) {
                            const amountUSDT = (parseInt(tx.value) / 1000000).toString();
                            await this.saveAndNotify(env, {
                                network: 'TRON', txHash: tx.transaction_id, amount: amountUSDT, fromAddr: tx.from, toAddr: tx.to, timestamp: tx.block_timestamp
                            }, webhooks);
                        }
                        if (tx.block_timestamp > globalNewestTime) globalNewestTime = tx.block_timestamp;
                    }
                }
            } catch (e) { console.error(`TRON 同步异常:`, e); }
        }
        if (globalNewestTime > minTimestamp) await env.kv.put("last_check_tron", globalNewestTime.toString());
    },

    // --- 数据入库与 Webhook 分发 ---
    async saveAndNotify(env, tx, webhooks) {
        // 尝试入库，利用 UNIQUE 主键防止重复分发
        const dbRes = await env.db.prepare(
            "INSERT OR IGNORE INTO orders (tx_hash, network, amount, from_address, to_address) VALUES (?, ?, ?, ?, ?)"
        ).bind(tx.txHash, tx.network, tx.amount, tx.fromAddr, tx.toAddr).run();

        // 只有首次插入成功 (说明是新订单)，才触发回调
        if (dbRes.meta.changes > 0 && webhooks.length > 0) {
            for (const wh of webhooks) {
                if (!wh.enabled || !wh.url || !wh.secret) continue;
                const binds = wh.binds.split(',').map(s => s.trim().toLowerCase());
                
                if (binds.includes('*') || binds.includes(tx.toAddr.toLowerCase())) {
                    // 安全增强：签名中加入 network 防止重放攻击
                    const signText = `${tx.network}${tx.txHash}${tx.amount}${wh.secret}`;
                    const msgBuffer = new TextEncoder().encode(signText);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                    const signHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                    fetch(wh.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            network: tx.network,
                            tx_hash: tx.txHash,
                            amount: tx.amount,
                            from_address: tx.fromAddr,
                            to_address: tx.toAddr,
                            sign: signHex,
                            timestamp: tx.timestamp
                        })
                    }).catch(e => console.error(`[${tx.network}] 分发失败:`, e));
                }
            }
        }
    }
};
