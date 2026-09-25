import { describe, expect, it } from 'vitest'
import { connectionStringProblem } from '@/test/setup-test-database'

// The values here are made up; none is a real credential.
describe('connectionStringProblem', () => {
  it('accepts a Neon connection string, with or without options and surrounding spaces', () => {
    expect(connectionStringProblem('postgresql://app_user:secret@ep-test-123.eu-central-1.aws.neon.tech/neondb?sslmode=require')).toBeNull()
    expect(connectionStringProblem('  postgres://u:p@localhost:5432/test  ')).toBeNull()
  })

  it('says what is wrong without repeating the value', () => {
    const cases: [string, RegExp][] = [
      ["psql 'postgresql://u:p@h/db'", /starts with "psql"/],
      ["'postgresql://u:p@h/db'", /quotes/],
      ['https://ep-test.neon.tech/sql', /"https:" instead of "postgresql:"/],
      ['jdbc:postgresql://h/db', /"jdbc:"/],
      ['postgresql://ep-test.neon.tech/neondb', /no user name/],
      ['postgresql://user@ep-test.neon.tech/neondb', /no password/],
      ['postgresql://user:pw@ep-test.neon.tech', /no database name/],
      ['ep-test.neon.tech/neondb', /not a URL/],
    ]
    for (const [value, message] of cases) {
      const problem = connectionStringProblem(value)
      expect(problem).toMatch(message)
      expect(problem).not.toContain('pw')
    }
  })
})
