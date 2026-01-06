# Credentials & Access Reference

## Production Site
- **URL:** https://www.orderhubnow.com
- **Legacy .NET:** http://inventory.limeapple.ca

---

## Admin Login
- **URL:** https://www.orderhubnow.com/admin/login
- **Username:** LimeAdmin
- **Password:** Green2022###!

---

## Rep Logins
| Rep Name | Email/Username | Password |
|----------|---------------|----------|
| Limeapple House Accounts | nrha | houseaccount5 |
| Betty Jacobs | betty@bettyjacobs.com | betty1 |
| Cory W | corywasserman@gmail.com | cory1 |
| Danielle K | daniellekuipers@gmail.com | Danielle1 |
| Deanna O | westcoastrepsdeanna@gmail.com | deanna1 |
| Fashion Avenue Showroom | fashionavenueshowroom@gmail.com | pam1 |
| For The Kids | forthekidschild@gmail.com | lisa1 |
| Jackie S | jackiesaraga@me.com | Jackie1 |
| Jade M | jade.millburn@gmail.com | jade1 |
| Jenni B | jennibshowroom@gmail.com | jenni1 |
| Karen F | coolkidsmarketing@gmail.com | Karen1 |
| Limeapple Retail House | nrha | houseaccount5 |
| Lisa Schram | Lisa@schramcompanies.com | lisa1 |
| Margaret S | margaret@thekidscorner.org | margaret1 |
| Meera D | meera@luxurybrands.co.in | meera1 |
| Peter McFarlane | peter@smallfry.ca | peter1 |
| Sales Rep USA | salesrep@usa.com | USA1 |
| Sarah White | sarah@sarahwhitemarketing.com | sarah1 |
| Shana S | Shana@showroom22.com | shana1 |
| Stacey T | stacey@gilbertsalesinc.com | stacey1 |

---

## EC2 Server Access
- **IP:** 3.131.126.250
- **User:** ubuntu
- **SSH Key:** LANext.pem (obtain from Bilal)
- **SSH Command:** `ssh -i LANext.pem ubuntu@3.131.126.250`

---

## Database
- **Type:** SQL Server (Azure)
- **Connection:** Via DATABASE_URL environment variable
- **Access:** Bilal manages credentials
- **GitHub Secret:** DATABASE_URL (set in repo settings)

---

## GitHub Repository
- **URL:** https://github.com/danielplant/orderhubnow
- **Secrets configured:**
  - DATABASE_URL
  - EC2_HOST (3.131.126.250)
  - EC2_USER (ubuntu)
  - EC2_SSH_KEY (private key content)

---

## Infrastructure Contacts
- **Bilal:** AWS/EC2 access, database, DNS, security groups
