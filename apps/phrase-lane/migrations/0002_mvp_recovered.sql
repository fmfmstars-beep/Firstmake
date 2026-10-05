-- Additive migration from the legacy schema. Apply once through the migration runner.
ALTER TABLE accounts ADD COLUMN auth_subject TEXT;
ALTER TABLE accounts ADD COLUMN email TEXT;
ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE accounts ADD COLUMN delete_state TEXT;
ALTER TABLE sessions ADD COLUMN authenticated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE sessions ADD COLUMN verified_auth_time INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS billing_events (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, object_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','processed')), received_at INTEGER NOT NULL, processed_at INTEGER);

CREATE TABLE IF NOT EXISTS budget_periods (
 id TEXT PRIMARY KEY, plan TEXT NOT NULL CHECK(plan IN ('free','pro')),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, limit_micros INTEGER NOT NULL CHECK(limit_micros>0),
 reserved_micros INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micros>=0),
 spent_micros INTEGER NOT NULL DEFAULT 0 CHECK(spent_micros>=0),
 cost_kind TEXT NOT NULL DEFAULT 'conservative_estimate' CHECK(cost_kind='conservative_estimate')
);

CREATE TABLE IF NOT EXISTS checkout_reservations (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 idempotency_key TEXT NOT NULL UNIQUE,
 session_id TEXT UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('creating','open','complete','expired')),
 request_parameters TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ephemeral_results (
 account_id TEXT NOT NULL, request_id TEXT NOT NULL, generation INTEGER NOT NULL,
 ciphertext TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,request_id),
 FOREIGN KEY(account_id,request_id) REFERENCES usage_requests(account_id,request_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS free_abuse_ledger (
 subject_hash TEXT NOT NULL, month TEXT NOT NULL, expires_at INTEGER NOT NULL,
 audio_used INTEGER NOT NULL DEFAULT 0 CHECK(audio_used>=0), audio_reserved INTEGER NOT NULL DEFAULT 0 CHECK(audio_reserved>=0),
 text_used INTEGER NOT NULL DEFAULT 0 CHECK(text_used>=0), text_reserved INTEGER NOT NULL DEFAULT 0 CHECK(text_reserved>=0),
 audio_attempts INTEGER NOT NULL DEFAULT 0 CHECK(audio_attempts>=0), text_attempts INTEGER NOT NULL DEFAULT 0 CHECK(text_attempts>=0),
 
 
 PRIMARY KEY(subject_hash,month)
);

CREATE TABLE IF NOT EXISTS free_daily_usage (
 subject_hash TEXT NOT NULL, day TEXT NOT NULL, expires_at INTEGER NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),
 PRIMARY KEY(subject_hash,day)
);

CREATE TABLE IF NOT EXISTS oauth_challenges (
 state_hash TEXT PRIMARY KEY,
 cookie_hash TEXT NOT NULL,
 nonce_hash TEXT NOT NULL,
 verifier TEXT NOT NULL,
 account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
 created INTEGER NOT NULL,
 expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS paid_period_grants (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
 subscription_id TEXT NOT NULL, period_id TEXT NOT NULL,
 period_start INTEGER NOT NULL, period_end INTEGER NOT NULL CHECK(period_end>period_start),
 grant_type TEXT NOT NULL CHECK(grant_type IN ('subscription_create','subscription_cycle')),
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 audio_limit INTEGER NOT NULL DEFAULT 7200 CHECK(audio_limit>=0),
 text_limit INTEGER NOT NULL DEFAULT 50000 CHECK(text_limit>=0),
 audio_attempt_limit INTEGER NOT NULL DEFAULT 600 CHECK(audio_attempt_limit>=0),
 text_attempt_limit INTEGER NOT NULL DEFAULT 500 CHECK(text_attempt_limit>=0),
 revoked_at INTEGER, created_at INTEGER NOT NULL,
 UNIQUE(invoice_id,period_id),
 UNIQUE(subscription_id,period_start,period_end,grant_type)
);

CREATE TABLE IF NOT EXISTS payment_metrics (invoice_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, currency TEXT NOT NULL, gross INTEGER NOT NULL CHECK(gross>=0), refunds INTEGER, fees INTEGER, net INTEGER, paid_at INTEGER NOT NULL, synced_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS quota_periods (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_id TEXT NOT NULL,
 subject_hash TEXT NOT NULL, plan TEXT NOT NULL CHECK(plan IN ('free','pro')),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
 audio_limit INTEGER NOT NULL CHECK(audio_limit>=0), text_limit INTEGER NOT NULL CHECK(text_limit>=0),
 audio_attempt_limit INTEGER NOT NULL CHECK(audio_attempt_limit>=0), text_attempt_limit INTEGER NOT NULL CHECK(text_attempt_limit>=0),
 audio_used INTEGER NOT NULL DEFAULT 0 CHECK(audio_used>=0), audio_reserved INTEGER NOT NULL DEFAULT 0 CHECK(audio_reserved>=0),
 text_used INTEGER NOT NULL DEFAULT 0 CHECK(text_used>=0), text_reserved INTEGER NOT NULL DEFAULT 0 CHECK(text_reserved>=0),
 audio_attempts INTEGER NOT NULL DEFAULT 0 CHECK(audio_attempts>=0), text_attempts INTEGER NOT NULL DEFAULT 0 CHECK(text_attempts>=0),
 UNIQUE(account_id,period_id), CHECK(audio_used+audio_reserved<=audio_limit), CHECK(text_used+text_reserved<=text_limit)
);

CREATE TABLE IF NOT EXISTS usage_requests (
 account_id TEXT NOT NULL, request_id TEXT NOT NULL, input_hash TEXT NOT NULL,
 period_id TEXT NOT NULL REFERENCES quota_periods(id), subject_hash TEXT NOT NULL,
 plan TEXT NOT NULL CHECK(plan IN ('free','pro')), kind TEXT NOT NULL CHECK(kind IN ('audio','text')),
 amount INTEGER NOT NULL CHECK(amount>0), month TEXT NOT NULL, day TEXT NOT NULL,
 budget_id TEXT NOT NULL REFERENCES budget_periods(id),
 state TEXT NOT NULL CHECK(state IN ('reserved','processing','completed','failed','released')),
 generation INTEGER NOT NULL DEFAULT 1 CHECK(generation>0), retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 1),
 reservation_token TEXT NOT NULL, cost_reserved INTEGER NOT NULL CHECK(cost_reserved>=0),
 cost_spent INTEGER NOT NULL DEFAULT 0 CHECK(cost_spent>=0),
 cost_kind TEXT NOT NULL DEFAULT 'conservative_estimate' CHECK(cost_kind='conservative_estimate'),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, lease_expires_at INTEGER NOT NULL,
 error_code TEXT, PRIMARY KEY(account_id,request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_auth_subject ON accounts(auth_subject);

CREATE INDEX IF NOT EXISTS ephemeral_results_expiry ON ephemeral_results(expires_at);

CREATE INDEX IF NOT EXISTS oauth_challenges_expiry ON oauth_challenges(expires);

CREATE INDEX IF NOT EXISTS paid_grants_account_period ON paid_period_grants(account_id,period_start,period_end);

CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);

CREATE INDEX IF NOT EXISTS usage_expiry ON usage(expires);

CREATE UNIQUE INDEX IF NOT EXISTS usage_one_active_account ON usage_requests(account_id) WHERE state IN ('reserved','processing');

CREATE UNIQUE INDEX IF NOT EXISTS usage_one_active_subject ON usage_requests(subject_hash) WHERE state IN ('reserved','processing');

CREATE INDEX IF NOT EXISTS usage_requests_expiry ON usage_requests(state,lease_expires_at);

CREATE TRIGGER IF NOT EXISTS checkout_account_insert BEFORE INSERT ON checkout_reservations BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND delete_state IS NULL)
  THEN RAISE(ABORT,'checkout_account_unavailable') END);
END;

CREATE TRIGGER IF NOT EXISTS checkout_account_rotation BEFORE UPDATE OF idempotency_key,request_parameters ON checkout_reservations BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND delete_state IS NULL)
  THEN RAISE(ABORT,'checkout_account_unavailable') END);
END;

CREATE TRIGGER IF NOT EXISTS quota_finish AFTER UPDATE ON usage_requests
WHEN OLD.state IN ('reserved','processing') AND NEW.state IN ('completed','failed','released') BEGIN
 SELECT (CASE WHEN NEW.state='completed' AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND delete_state IS NULL)
  THEN RAISE(ABORT,'account_unavailable') END);
 SELECT (CASE WHEN NEW.state='completed' AND NEW.plan='pro' AND NOT EXISTS(SELECT 1 FROM paid_period_grants g
  JOIN quota_periods q ON q.id=NEW.period_id WHERE g.account_id=NEW.account_id AND ('pro:'||g.period_id)=q.period_id
  AND g.revoked_at IS NULL AND g.period_start<=NEW.created_at AND g.period_end>NEW.created_at)
  THEN RAISE(ABORT,'grant_unavailable') END);
 SELECT (CASE WHEN NEW.state='completed' AND (OLD.state!='processing' OR NOT EXISTS(
  SELECT 1 FROM ephemeral_results WHERE account_id=NEW.account_id AND request_id=NEW.request_id AND generation=NEW.generation
 )) THEN RAISE(ABORT,'result_invariant') END);
 UPDATE quota_periods SET
  audio_reserved=audio_reserved-CASE WHEN NEW.kind='audio' THEN NEW.amount ELSE 0 END,
  text_reserved=text_reserved-CASE WHEN NEW.kind='text' THEN NEW.amount ELSE 0 END,
  audio_used=audio_used+CASE WHEN NEW.kind='audio' AND NEW.state='completed' THEN NEW.amount ELSE 0 END,
  text_used=text_used+CASE WHEN NEW.kind='text' AND NEW.state='completed' THEN NEW.amount ELSE 0 END
 WHERE id=NEW.period_id AND (NEW.kind!='audio' OR audio_reserved>=NEW.amount) AND (NEW.kind!='text' OR text_reserved>=NEW.amount);
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'quota_invariant') END);
 UPDATE free_abuse_ledger SET
  audio_reserved=audio_reserved-CASE WHEN NEW.kind='audio' THEN NEW.amount ELSE 0 END,
  text_reserved=text_reserved-CASE WHEN NEW.kind='text' THEN NEW.amount ELSE 0 END,
  audio_used=audio_used+CASE WHEN NEW.kind='audio' AND NEW.state='completed' THEN NEW.amount ELSE 0 END,
  text_used=text_used+CASE WHEN NEW.kind='text' AND NEW.state='completed' THEN NEW.amount ELSE 0 END
 WHERE NEW.plan='free' AND subject_hash=NEW.subject_hash AND month=NEW.month;
 SELECT (CASE WHEN NEW.plan='free' AND changes()!=1 THEN RAISE(ABORT,'quota_invariant') END);
 UPDATE free_daily_usage SET reserved=reserved-NEW.amount, used=used+CASE WHEN NEW.state='completed' THEN NEW.amount ELSE 0 END
 WHERE NEW.plan='free' AND NEW.kind='audio' AND subject_hash=NEW.subject_hash AND day=NEW.day;
 SELECT (CASE WHEN NEW.plan='free' AND NEW.kind='audio' AND changes()!=1 THEN RAISE(ABORT,'quota_invariant') END);
 UPDATE budget_periods SET reserved_micros=reserved_micros-OLD.cost_reserved,
  spent_micros=spent_micros+MAX(0,NEW.cost_spent-OLD.cost_spent)
 WHERE id=NEW.budget_id AND reserved_micros>=OLD.cost_reserved;
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'budget_invariant') END);
END;

CREATE TRIGGER IF NOT EXISTS quota_reserve AFTER INSERT ON usage_requests BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND delete_state IS NULL)
  THEN RAISE(ABORT,'account_unavailable') END);
 SELECT (CASE WHEN NEW.plan='pro' AND NOT EXISTS(SELECT 1 FROM paid_period_grants g
  JOIN quota_periods q ON q.id=NEW.period_id WHERE g.account_id=NEW.account_id AND ('pro:'||g.period_id)=q.period_id
  AND g.revoked_at IS NULL AND g.period_start<=NEW.created_at AND g.period_end>NEW.created_at)
  THEN RAISE(ABORT,'grant_unavailable') END);
 UPDATE quota_periods SET
  audio_reserved=audio_reserved+CASE WHEN NEW.kind='audio' THEN NEW.amount ELSE 0 END,
  text_reserved=text_reserved+CASE WHEN NEW.kind='text' THEN NEW.amount ELSE 0 END
 WHERE id=NEW.period_id AND account_id=NEW.account_id AND plan=NEW.plan
  AND starts_at<=NEW.created_at AND ends_at>NEW.created_at
  AND (NEW.kind!='audio' OR (audio_used+audio_reserved+NEW.amount<=audio_limit AND audio_attempts<audio_attempt_limit))
  AND (NEW.kind!='text' OR (text_used+text_reserved+NEW.amount<=text_limit AND text_attempts<text_attempt_limit));
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'quota_exhausted') END);
 UPDATE free_abuse_ledger SET
  audio_reserved=audio_reserved+CASE WHEN NEW.kind='audio' THEN NEW.amount ELSE 0 END,
  text_reserved=text_reserved+CASE WHEN NEW.kind='text' THEN NEW.amount ELSE 0 END
 WHERE NEW.plan='free' AND subject_hash=NEW.subject_hash AND month=NEW.month
  AND (NEW.kind!='audio' OR (audio_used+audio_reserved+NEW.amount<=600 AND audio_attempts<60))
  AND (NEW.kind!='text' OR (text_used+text_reserved+NEW.amount<=5000 AND text_attempts<50));
 SELECT (CASE WHEN NEW.plan='free' AND changes()!=1 THEN RAISE(ABORT,'quota_exhausted') END);
 UPDATE free_daily_usage SET reserved=reserved+NEW.amount
 WHERE NEW.plan='free' AND NEW.kind='audio' AND subject_hash=NEW.subject_hash AND day=NEW.day AND used+reserved+NEW.amount<=120;
 SELECT (CASE WHEN NEW.plan='free' AND NEW.kind='audio' AND changes()!=1 THEN RAISE(ABORT,'daily_quota_exhausted') END);
 UPDATE budget_periods SET reserved_micros=reserved_micros+NEW.cost_reserved
 WHERE id=NEW.budget_id AND plan=NEW.plan AND spent_micros+reserved_micros+NEW.cost_reserved<=limit_micros;
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'budget_exhausted') END);
END;

CREATE TRIGGER IF NOT EXISTS quota_retry AFTER UPDATE ON usage_requests
WHEN OLD.state='processing' AND NEW.state='processing' AND NEW.generation!=OLD.generation BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND delete_state IS NULL)
  THEN RAISE(ABORT,'account_unavailable') END);
 SELECT (CASE WHEN NEW.plan='pro' AND NOT EXISTS(SELECT 1 FROM paid_period_grants g
  JOIN quota_periods q ON q.id=NEW.period_id WHERE g.account_id=NEW.account_id AND ('pro:'||g.period_id)=q.period_id
  AND g.revoked_at IS NULL AND g.period_start<=NEW.updated_at AND g.period_end>NEW.updated_at)
  THEN RAISE(ABORT,'grant_unavailable') END);
 SELECT (CASE WHEN NEW.generation!=OLD.generation+1 OR OLD.retry_count!=0 OR NEW.retry_count!=1 THEN RAISE(ABORT,'retry_exhausted') END);
 UPDATE quota_periods SET audio_attempts=audio_attempts+CASE WHEN NEW.kind='audio' THEN 1 ELSE 0 END,
  text_attempts=text_attempts+CASE WHEN NEW.kind='text' THEN 1 ELSE 0 END
 WHERE id=NEW.period_id AND (NEW.kind!='audio' OR audio_attempts<audio_attempt_limit) AND (NEW.kind!='text' OR text_attempts<text_attempt_limit);
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'attempts_exhausted') END);
 UPDATE free_abuse_ledger SET audio_attempts=audio_attempts+CASE WHEN NEW.kind='audio' THEN 1 ELSE 0 END,
  text_attempts=text_attempts+CASE WHEN NEW.kind='text' THEN 1 ELSE 0 END
 WHERE NEW.plan='free' AND subject_hash=NEW.subject_hash AND month=NEW.month
  AND (NEW.kind!='audio' OR audio_attempts<60) AND (NEW.kind!='text' OR text_attempts<50);
 SELECT (CASE WHEN NEW.plan='free' AND changes()!=1 THEN RAISE(ABORT,'attempts_exhausted') END);
 UPDATE budget_periods SET spent_micros=spent_micros+(NEW.cost_spent-OLD.cost_spent)
 WHERE id=NEW.budget_id AND spent_micros+reserved_micros+(NEW.cost_spent-OLD.cost_spent)<=limit_micros;
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'budget_exhausted') END);
END;

CREATE TRIGGER IF NOT EXISTS quota_start AFTER UPDATE ON usage_requests
WHEN OLD.state='reserved' AND NEW.state='processing' BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND delete_state IS NULL)
  THEN RAISE(ABORT,'account_unavailable') END);
 SELECT (CASE WHEN NEW.plan='pro' AND NOT EXISTS(SELECT 1 FROM paid_period_grants g
  JOIN quota_periods q ON q.id=NEW.period_id WHERE g.account_id=NEW.account_id AND ('pro:'||g.period_id)=q.period_id
  AND g.revoked_at IS NULL AND g.period_start<=NEW.updated_at AND g.period_end>NEW.updated_at)
  THEN RAISE(ABORT,'grant_unavailable') END);
 UPDATE quota_periods SET audio_attempts=audio_attempts+CASE WHEN NEW.kind='audio' THEN 1 ELSE 0 END,
  text_attempts=text_attempts+CASE WHEN NEW.kind='text' THEN 1 ELSE 0 END
 WHERE id=NEW.period_id AND (NEW.kind!='audio' OR audio_attempts<audio_attempt_limit) AND (NEW.kind!='text' OR text_attempts<text_attempt_limit);
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'attempts_exhausted') END);
 UPDATE free_abuse_ledger SET audio_attempts=audio_attempts+CASE WHEN NEW.kind='audio' THEN 1 ELSE 0 END,
  text_attempts=text_attempts+CASE WHEN NEW.kind='text' THEN 1 ELSE 0 END
 WHERE NEW.plan='free' AND subject_hash=NEW.subject_hash AND month=NEW.month
  AND (NEW.kind!='audio' OR audio_attempts<60) AND (NEW.kind!='text' OR text_attempts<50);
 SELECT (CASE WHEN NEW.plan='free' AND changes()!=1 THEN RAISE(ABORT,'attempts_exhausted') END);
 UPDATE budget_periods SET reserved_micros=reserved_micros-OLD.cost_reserved, spent_micros=spent_micros+OLD.cost_reserved
 WHERE id=NEW.budget_id AND reserved_micros>=OLD.cost_reserved;
 SELECT (CASE WHEN changes()!=1 THEN RAISE(ABORT,'budget_invariant') END);
END;
