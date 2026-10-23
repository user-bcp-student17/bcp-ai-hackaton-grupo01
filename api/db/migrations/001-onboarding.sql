CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('DNI', 'CE')),
  document_number TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  wallet_id TEXT UNIQUE REFERENCES wallets(id),
  kyc_status TEXT NOT NULL CHECK (kyc_status IN ('activa', 'pendiente', 'rechazada')),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (document_type, document_number),
  CHECK ((active = 1 AND kyc_status = 'activa') OR
         (active = 0 AND kyc_status IN ('pendiente', 'rechazada') AND wallet_id IS NULL))
);
CREATE TABLE wallets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency = 'PEN'),
  balance_cents INTEGER NOT NULL CHECK (
    typeof(balance_cents) = 'integer' AND balance_cents BETWEEN 0 AND 100000000
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE wallet_openings (
  wallet_id TEXT PRIMARY KEY NOT NULL REFERENCES wallets(id),
  amount_cents INTEGER NOT NULL CHECK (
    typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 0 AND 100000000
  ),
  created_at TEXT NOT NULL
);
