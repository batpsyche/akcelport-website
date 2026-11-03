// Creates the first administrator (or another admin). Usage:
//   npm run create-admin -- --email you@example.com [--name "Your Name"] [--password '...']
// Without --password the command reads ADMIN_PASSWORD from the environment, or prompts on a terminal.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadDotEnv, loadConfig } from '../config.ts';
import { createPool } from '../db.ts';
import { migrate } from '../migrate.ts';
import { passwordProblem } from '../auth/password.ts';
import { createUser } from '../users/routes.ts';

loadDotEnv();
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const email = (arg('--email') || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Usage: npm run create-admin -- --email you@example.com [--name "Name"] [--password "..."]'); process.exit(2); }
let password = arg('--password') || process.env.ADMIN_PASSWORD || '';
if (!password) {
  if (!stdin.isTTY) { console.error('No password: pass --password, set ADMIN_PASSWORD, or run on a terminal.'); process.exit(2); }
  const rl = createInterface({ input: stdin, output: stdout });
  password = await rl.question(`Password for ${email}: `);
  rl.close();
}
const problem = passwordProblem(password);
if (problem) { console.error(problem); process.exit(2); }

const config = loadConfig();
const pool = createPool(config.databaseUrl);
try {
  await migrate(pool);
  const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rowCount) { console.error(`${email} already exists. Reset the password from the Users page instead.`); process.exit(1); }
  const { user } = await createUser(pool, { email, name: arg('--name') || '', role: 'admin', password }, null);
  await pool.query('UPDATE users SET must_change_password = false WHERE id = $1', [user.id]);
  console.log(`Created administrator ${email} (id ${user.id}). Sign in at http://localhost:${config.port}/`);
} finally {
  await pool.end();
}
