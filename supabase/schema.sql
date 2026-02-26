-- Supabase Schema for Profit Food V3

-- Banks Table
CREATE TABLE IF NOT EXISTS banks (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Favored (Entities) Table
CREATE TABLE IF NOT EXISTS favored (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('FORNECEDOR', 'CLIENTE', 'AMBOS')),
    document TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_favored_document ON favored(document);

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subgroup_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    is_fixed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Postings Table
CREATE TABLE IF NOT EXISTS postings (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('LIQUIDADO', 'PROVISIONADO')),
    competence_date DATE NOT NULL,
    occurrence_date DATE NOT NULL,
    due_date DATE,
    liquidation_date DATE,
    "group" TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    observations TEXT,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    entity_id UUID REFERENCES favored(id) ON DELETE SET NULL,
    bank_id UUID REFERENCES banks(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- XML Mappings Table (from previous feature)
CREATE TABLE IF NOT EXISTS xml_item_mappings (
    id UUID PRIMARY KEY,
    supplier_cnpj TEXT NOT NULL,
    match_type TEXT NOT NULL,
    match_key TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank Transactions Table (OFX movements)
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID REFERENCES banks(id) ON DELETE SET NULL,
    posted_date DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    description TEXT,
    fit_id TEXT,
    check_number TEXT,
    ofx_file_hash TEXT,
    raw JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_trans_bank_date ON bank_transactions(bank_id, posted_date);
CREATE INDEX IF NOT EXISTS idx_bank_trans_fit_id ON bank_transactions(fit_id);
CREATE INDEX IF NOT EXISTS idx_bank_trans_hash ON bank_transactions(ofx_file_hash);

-- Reconciliations Table (Link between Transaction and Posting)
CREATE TABLE IF NOT EXISTS reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE CASCADE,
    posting_id UUID REFERENCES postings(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('AUTO', 'MANUAL')),
    match_score NUMERIC(5, 2),
    matched_amount NUMERIC(15, 2),
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bank_transaction_id, posting_id)
);

-- OFX Imports History Table
CREATE TABLE IF NOT EXISTS ofx_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID REFERENCES banks(id) ON DELETE SET NULL,
    file_hash TEXT NOT NULL UNIQUE,
    file_name TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    from_date DATE,
    to_date DATE,
    total_transactions INT,
    status TEXT CHECK (status IN ('IMPORTED', 'PARTIAL', 'ERROR')),
    error_message TEXT
);

-- PDV Payment Mappings
CREATE TABLE IF NOT EXISTS pdv_payment_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL, -- ex: 'SAIPOS'
    raw_label TEXT NOT NULL, -- ex: 'Crédito Visa STONE'
    normalized_label TEXT,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    default_status TEXT CHECK (default_status IN ('LIQUIDADO', 'PROVISIONADO')),
    default_bank_id UUID REFERENCES banks(id) ON DELETE SET NULL,
    UNIQUE(source, raw_label)
);

-- PDV Imports History
CREATE TABLE IF NOT EXISTS pdv_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL, -- 'SAIPOS'
    file_hash TEXT NOT NULL UNIQUE,
    file_name TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    from_date DATE,
    to_date DATE,
    total_rows INT,
    status TEXT CHECK (status IN ('IMPORTED', 'ERROR')),
    error_message TEXT
);

-- PDV Import Items
CREATE TABLE IF NOT EXISTS pdv_import_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pdv_import_id UUID REFERENCES pdv_imports(id) ON DELETE CASCADE,
    posting_id UUID REFERENCES postings(id) ON DELETE CASCADE,
    raw_label TEXT,
    amount NUMERIC(15, 2),
    day DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
