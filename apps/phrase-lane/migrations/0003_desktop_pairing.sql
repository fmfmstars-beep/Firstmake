-- Additive only. Run in isolated staging first; leave DESKTOP_ENABLED=false until tested.
CREATE TABLE IF NOT EXISTS desktop_pairings (
 device_hash TEXT PRIMARY KEY,
 user_code TEXT UNIQUE NOT NULL,
 challenge TEXT NOT NULL,
 expires INTEGER NOT NULL,
 account_id TEXT,
 parent_hash TEXT,
 consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1))
);
CREATE INDEX IF NOT EXISTS desktop_pairings_expiry ON desktop_pairings(expires);
CREATE TABLE IF NOT EXISTS desktop_sessions (
 hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 parent_hash TEXT NOT NULL,
 expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS desktop_sessions_expiry ON desktop_sessions(expires);
