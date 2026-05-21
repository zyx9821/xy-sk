-- schema.sql
DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
    tx_hash TEXT,
    network TEXT NOT NULL,
    amount TEXT NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_hash, network)
);
