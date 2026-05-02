import bcrypt from 'bcrypt'
import * as readline from 'node:readline/promises'
import { sqlite } from '@team-claude/db/client'

/**
 * T-18 admin 비밀번호 재설정 CLI.
 * 사용: pnpm --filter @team-claude/api reset-password <email>
 */

const main = async (): Promise<void> => {
  const email = process.argv[2]
  if (!email) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm --filter @team-claude/api reset-password <email>')
    process.exit(1)
  }

  const exists = sqlite.prepare('SELECT 1 FROM users WHERE email = ?').get(email)
  if (!exists) {
    // eslint-disable-next-line no-console
    console.error(`❌ 사용자 없음: ${email}`)
    process.exit(1)
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const password = await rl.question('새 비밀번호 (8자 이상): ')
  rl.close()

  if (password.length < 8 || password.length > 128) {
    // eslint-disable-next-line no-console
    console.error('❌ 비밀번호는 8~128자')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  const result = sqlite
    .prepare('UPDATE users SET password_hash = ? WHERE email = ?')
    .run(hash, email)
  if (result.changes === 0) {
    // eslint-disable-next-line no-console
    console.error(`❌ 갱신 실패: ${email}`)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(`✅ ${email} 비밀번호 재설정 완료`)
  sqlite.close()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Reset password failed:', err)
  process.exit(1)
})
