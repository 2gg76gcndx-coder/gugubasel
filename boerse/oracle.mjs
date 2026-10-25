import oracledb from 'oracledb';
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
let poolPromise;
export async function transaction(fn) {
  poolPromise ??= oracledb.createPool({user:process.env.ORACLE_USER, password:process.env.ORACLE_PASSWORD, connectString:process.env.ORACLE_CONNECT_STRING, poolMin:0, poolMax:8});
  const c = await (await poolPromise).getConnection();
  const db = {
    run: (sql, binds={}) => c.execute(sql, binds),
    one: async (sql, binds={}) => (await c.execute(sql, binds)).rows[0],
    all: async (sql, binds={}) => (await c.execute(sql, binds)).rows
  };
  try { const result = await fn(db); await c.commit(); return result; }
  catch (e) { await c.rollback(); throw e; }
  finally { await c.close(); }
}
// Persistent, shared across processes. Unique-key conflicts are retried under a row lock.
export async function rate(db, key, limit, minutes) {
  let row = await db.one('SELECT hits, expires_at FROM gb_rate_limits WHERE bucket_hash=:key FOR UPDATE', {key});
  if (!row) {
    try { await db.run("INSERT INTO gb_rate_limits VALUES (:key,0,SYSTIMESTAMP+NUMTODSINTERVAL(:minutes,'MINUTE'))", {key,minutes}); }
    catch(e) { if(e.errorNum !== 1) throw e; }
    row = await db.one('SELECT hits, expires_at FROM gb_rate_limits WHERE bucket_hash=:key FOR UPDATE', {key});
  }
  if(new Date(row.EXPIRES_AT) <= new Date()) {
    await db.run("UPDATE gb_rate_limits SET hits=1, expires_at=SYSTIMESTAMP+NUMTODSINTERVAL(:minutes,'MINUTE') WHERE bucket_hash=:key", {key,minutes});
    return;
  }
  if(row.HITS >= limit) { const e=new Error('Too many attempts. Please try again later.'); e.status=429; throw e; }
  await db.run('UPDATE gb_rate_limits SET hits=hits+1 WHERE bucket_hash=:key', {key});
}
