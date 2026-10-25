-- Fresh installation only. Run ONCE as GUGU_BORSE, never PUBLIC.
-- For an existing SMS draft schema use migrate-passkeys.sql instead.
CREATE TABLE gb_members (
 id VARCHAR2(36) PRIMARY KEY,
 phone VARCHAR2(16) NOT NULL UNIQUE,
 display_name VARCHAR2(80) NOT NULL,
 role VARCHAR2(10) DEFAULT 'member' NOT NULL CHECK (role IN ('admin','member')),
 status VARCHAR2(10) DEFAULT 'active' NOT NULL CHECK (status IN ('pending','active','blocked')),
 created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE TABLE gb_registrations (
 id VARCHAR2(36) PRIMARY KEY,
 token_hash VARCHAR2(64) NOT NULL UNIQUE,
 reference VARCHAR2(20) NOT NULL UNIQUE,
 phone VARCHAR2(16) NOT NULL,
 display_name VARCHAR2(80) NOT NULL,
 challenge VARCHAR2(128) NOT NULL,
 challenge_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
 status VARCHAR2(10) DEFAULT 'started' NOT NULL CHECK (status IN ('started','verifying','pending','approved','rejected')),
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE INDEX gb_reg_phone ON gb_registrations(phone);
CREATE TABLE gb_passkeys (
 credential_id VARCHAR2(1400) PRIMARY KEY,
 registration_id VARCHAR2(36) NOT NULL UNIQUE REFERENCES gb_registrations(id),
 member_id VARCHAR2(36) REFERENCES gb_members(id),
 public_key VARCHAR2(4000) NOT NULL,
 sign_count NUMBER NOT NULL,
 transports VARCHAR2(500) NOT NULL,
 revoked_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX gb_key_member ON gb_passkeys(member_id);
CREATE TABLE gb_login_challenges (
 token_hash VARCHAR2(64) PRIMARY KEY,
 member_id VARCHAR2(36) NOT NULL REFERENCES gb_members(id),
 challenge VARCHAR2(128) NOT NULL,
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
 used_at TIMESTAMP WITH TIME ZONE
);
CREATE TABLE gb_sessions (
 token_hash VARCHAR2(64) PRIMARY KEY,
 member_id VARCHAR2(36) NOT NULL REFERENCES gb_members(id),
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX gb_sess_member ON gb_sessions(member_id);
CREATE TABLE gb_rate_limits (
 bucket_hash VARCHAR2(64) PRIMARY KEY,
 hits NUMBER NOT NULL,
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE gb_audit (
 id VARCHAR2(36) PRIMARY KEY,
 actor_id VARCHAR2(36) REFERENCES gb_members(id),
 action VARCHAR2(40) NOT NULL,
 target_id VARCHAR2(36) REFERENCES gb_members(id),
 created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);
-- Separate runtime account: CRUD only on these seven tables, no DDL or DBA.
