/**
 * Sales Rep from Reps table.
 * Note: Password is stored in Users table (Users.RepId → Reps.ID).
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
 * Rep with login info (password from Users table).
 */
export interface RepWithLogin extends Rep {
  password: string | null // From Users.Password (if exists)
  loginId: string | null // From Users.LoginID (if exists)
}

export interface RepsListResult {
  items: RepWithLogin[]
  total: number
}
