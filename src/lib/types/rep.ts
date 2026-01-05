/**
 * Sales Rep from Reps table.
 * Note: Login credentials are stored in Users table (Users.RepId -> Reps.ID).
 */
export interface Rep {
  id: number // Reps.ID (Int)
  name: string // Reps.Name
  code: string // Reps.Code (e.g., "JS" for John Smith)
  address: string // Reps.Address (single field, not structured)
  phone: string // Reps.Phone
  fax: string // Reps.Fax
  cell: string // Reps.Cell
  email1: string // Reps.Email1
  email2: string // Reps.Email2
  email3: string // Reps.Email3
  country: string // Reps.Country (STRING, not enum)
}

/**
 * User account status for login.
 */
export type UserStatus = 'invited' | 'active' | 'legacy' | 'disabled'

/**
 * Rep with login status (from Users table).
 * Note: Password is never exposed to the frontend.
 */
export interface RepWithLogin extends Rep {
  userId: number | null // Users.ID (if exists)
  loginEmail: string | null // Users.Email or Users.LoginID
  status: UserStatus // Users.Status
}

export interface RepsListResult {
  items: RepWithLogin[]
  total: number
}
