-- Run ONCE as a dedicated GUGU_BORSE schema owner, never in PUBLIC.
-- These prefixed names avoid overwriting earlier MEMBERS/INVITATIONS tables.
CREATE TABLE gb_members (
 id VARCHAR2(36) PRIMARY KEY,
 phone VARCHAR2(16) NOT NULL UNIQUE,
 display_name VARCHAR2(80) NOT NULL,
 referred_by VARCHAR2(120),
 role VARCHAR2(10) DEFAULT 'member' NOT NULL CHECK (role IN ('admin','member')),
 status VARCHAR2(10) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending','active','blocked')),
 created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE TABLE gb_invitations (
 token_hash VARCHAR2(64) PRIMARY KEY,
 member_id VARCHAR2(36) NOT NULL REFERENCES gb_members(id),
 created_by VARCHAR2(36) NOT NULL REFERENCES gb_members(id),
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
 used_at TIMESTAMP WITH TIME ZONE,
 revoked_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX gb_inv_member ON gb_invitations(member_id);
CREATE TABLE gb_challenges (
 token_hash VARCHAR2(64) PRIMARY KEY,
 member_id VARCHAR2(36) NOT NULL REFERENCES gb_members(id),
 invitation_hash VARCHAR2(64) REFERENCES gb_invitations(token_hash),
 verification_sid VARCHAR2(34) NOT NULL,
 attempts NUMBER DEFAULT 0 NOT NULL,
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
-- Runtime account needs only SELECT/INSERT/UPDATE/DELETE on these six tables.
-- Do not grant DBA, schema creation or access to unrelated Gugu data.
