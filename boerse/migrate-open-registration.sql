-- Run once as the schema owner, while the API is stopped. Back up first.
-- Existing phone-based accounts are retained. Assign usernames explicitly before allowing login.
-- Do not drop or recreate GB_MEMBERS or GB_PASSKEYS.
ALTER TABLE gb_members ADD (username VARCHAR2(30));
ALTER TABLE gb_registrations ADD (username VARCHAR2(30));
ALTER TABLE gb_members MODIFY (phone NULL);
ALTER TABLE gb_registrations MODIFY (phone NULL);
CREATE UNIQUE INDEX gb_members_username_uq ON gb_members(username);
CREATE INDEX gb_registrations_username_idx ON gb_registrations(username);
-- Existing registrations remain non-loginable until re-enrolled using the new username flow.
-- Existing GB_MEMBERS need an operator-managed username assignment and passkey migration.
-- Verify migration on a staging database before deploying the updated API.
