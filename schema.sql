DROP TABLE IF EXISTS baselines;
CREATE TABLE baselines (acct_id TEXT PRIMARY KEY, amount INTEGER);
INSERT INTO baselines (acct_id, amount) VALUES ('ACME-123', 50000);
INSERT INTO baselines (acct_id, amount) VALUES ('GLOBEX-456', 75000);