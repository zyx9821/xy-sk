CREATE TABLE IF NOT EXISTS orders (
    tx_hash TEXT PRIMARY KEY,
    amount TEXT NOT NULL,
    from_address TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
