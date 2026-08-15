CREATE TABLE IF NOT EXISTS getkey_checkpoint_flows (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  service_id TEXT,
  product_id TEXT NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  completed_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_getkey_checkpoint_flows_provider ON getkey_checkpoint_flows(provider_id, created_at);
CREATE INDEX IF NOT EXISTS idx_getkey_checkpoint_flows_status ON getkey_checkpoint_flows(status, expires_at);

CREATE TABLE IF NOT EXISTS getkey_checkpoint_flow_items (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (flow_id) REFERENCES getkey_checkpoint_flows(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_getkey_flow_item_sequence ON getkey_checkpoint_flow_items(flow_id, sequence);
CREATE INDEX IF NOT EXISTS idx_getkey_flow_items_checkpoint ON getkey_checkpoint_flow_items(checkpoint_id, status);
