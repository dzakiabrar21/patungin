import db from '../services/db.js';

const badTx = db.prepare(`SELECT * FROM transactions WHERE amount = 2026 OR merchant LIKE '%dari awal%' OR description LIKE '%dari awal%'`).all();
console.log('Bad transactions found:', badTx);

if (badTx.length > 0) {
  for (const t of badTx) {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(t.id);
    console.log('Deleted bad transaction:', t.id);
  }
}

const badAcc = db.prepare(`SELECT * FROM accounts WHERE LOWER(name) LIKE '%januari%'`).all();
console.log('Bad accounts found:', badAcc);
if (badAcc.length > 0) {
  for (const a of badAcc) {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(a.id);
    console.log('Deleted bad account:', a.id, a.name);
  }
}
