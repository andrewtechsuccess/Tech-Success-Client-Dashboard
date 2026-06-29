// CLI to set/replace the PSPortal login password.
//   node setup.js                 -> interactive (masked) prompt
//   node setup.js --password xyz   -> non-interactive
import readline from 'node:readline';
import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { CONFIG_PATH, ensureDirs, DEFAULT_SETTINGS } from './server/config.js';

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function promptHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Print the prompt directly, then mask everything the user types.
    process.stdout.write(query);
    rl.stdoutMuted = true;
    rl._writeToOutput = function (str) {
      if (rl.stdoutMuted) {
        if (str.includes('\n')) rl.output.write('\n');
      } else {
        rl.output.write(str);
      }
    };
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

(async () => {
  ensureDirs();
  const argv = process.argv.slice(2);
  const pIdx = argv.indexOf('--password');
  let password = pIdx >= 0 ? argv[pIdx + 1] : undefined;

  if (!password) {
    if (!process.stdin.isTTY) {
      console.error('No TTY. Pass --password "yourpassword".');
      process.exit(1);
    }
    password = await promptHidden('New PSPortal password: ');
    const confirm = await promptHidden('Confirm password:      ');
    if (password !== confirm) {
      console.error('\nPasswords do not match.');
      process.exit(1);
    }
  }

  if (!password || password.length < 1) {
    console.error('Password cannot be empty.');
    process.exit(1);
  }

  const config = readConfig() || { settings: { ...DEFAULT_SETTINGS } };
  config.passwordHash = bcrypt.hashSync(password, 10);
  if (!config.jwtSecret) config.jwtSecret = crypto.randomBytes(32).toString('hex');
  if (!config.settings) config.settings = { ...DEFAULT_SETTINGS };
  delete config._defaultPassword;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log(`\n✓ Password updated -> ${CONFIG_PATH}\n`);
  process.exit(0);
})();
