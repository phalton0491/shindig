const { spawn } = require('node:child_process');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
const args = [cliPath, 'start', ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_NO_DEPENDENCY_VALIDATION:
      process.env.EXPO_NO_DEPENDENCY_VALIDATION || '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
