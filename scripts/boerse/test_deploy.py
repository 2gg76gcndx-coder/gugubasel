"""Exercise deployment and rollback with fake service/network/package commands."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('deploy.sh').resolve()
FILES = 'app.js bootstrap.mjs gugu-boerse.css http.mjs index.html marketplace.mjs oracle.mjs package-lock.json package.json repository.mjs security.mjs server.mjs service.mjs webauthn.mjs'.split()


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / 'app with spaces'
        self.app.mkdir()
        source = self.root / 'source'
        source.mkdir()
        for name in FILES:
            (source / name).write_text('// new\n' if name.endswith(('.js', '.mjs')) else 'new\n')
            (self.app / name).write_text('// old\n' if name.endswith(('.js', '.mjs')) else 'old\n')
        for folder in [source, self.app]:
            (folder / 'package.json').write_text('{"type":"module"}\n')
        (self.app / '.env').write_text('PORT=3000\nPRESERVED_SECRET=unchanged\n')
        for name in ['uploads', 'wallet', 'node_modules']:
            (self.app / name).mkdir()
            (self.app / name / 'keep').write_text('original')
        (self.app / 'schema.sql').write_text('never run')
        self.archive = self.root / 'release.tar.gz'
        subprocess.run(['tar', '-czf', str(self.archive), '-C', str(source), *FILES], check=True)
        fake = self.root / 'bin'
        fake.mkdir()
        commands = {
            'sudo': 'printf "%s\\n" "$*" >> "$TEST_LOG"; exit 0',
            'curl': '[ "${FAIL_HEALTH:-0}" != 1 ]',
            'sleep': 'exit 0',
            'npm': '[ "${FAIL_INSTALL:-0}" != 1 ] || exit 1; mkdir -p node_modules; echo new > node_modules/version',
        }
        for name, body in commands.items():
            path = fake / name
            path.write_text('#!/usr/bin/env bash\nset -e\n' + body + '\n')
            path.chmod(0o755)
        self.env = dict(os.environ, PATH=str(fake) + ':' + os.environ['PATH'], TEST_LOG=str(self.root / 'service.log'))

    def run_deploy(self, **env):
        return subprocess.run(['bash', str(SCRIPT), str(self.app), 'gugu.service', 'a' * 40, str(self.archive)], env=dict(self.env, **env), text=True, capture_output=True)

    def assert_private_files_unchanged(self):
        self.assertEqual((self.app / '.env').read_text(), 'PORT=3000\nPRESERVED_SECRET=unchanged\n')
        for name in ['uploads', 'wallet']:
            self.assertEqual((self.app / name / 'keep').read_text(), 'original')
        self.assertEqual((self.app / 'schema.sql').read_text(), 'never run')

    def test_publish_and_preserve_private_files(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual((self.app / 'server.mjs').read_text(), '// new\n')
        self.assertEqual((self.app / '.github-deployed-commit').read_text().strip(), 'a' * 40)
        backup = next((self.app / '.github-deploy-backups').iterdir())
        self.assertEqual((backup / 'server.mjs').read_text(), '// old\n')
        self.assertEqual((backup / 'node_modules/keep').read_text(), 'original')
        self.assert_private_files_unchanged()

    def test_failed_health_restores_source_and_dependencies(self):
        result = self.run_deploy(FAIL_HEALTH='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('restoring the previous application', result.stdout)
        self.assertEqual((self.app / 'server.mjs').read_text(), '// old\n')
        self.assertEqual((self.app / 'node_modules/keep').read_text(), 'original')
        self.assertFalse((self.app / '.github-deployed-commit').exists())
        self.assert_private_files_unchanged()

    def test_failed_install_does_not_stop_service(self):
        result = self.run_deploy(FAIL_INSTALL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('systemctl stop', (self.root / 'service.log').read_text())
        self.assertEqual((self.app / 'server.mjs').read_text(), '// old\n')
        self.assertEqual((self.app / 'node_modules/keep').read_text(), 'original')
        self.assert_private_files_unchanged()


if __name__ == '__main__':
    unittest.main()
