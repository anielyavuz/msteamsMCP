# Microsoft Entra app registration

Each organization uses **its own** app registration (single tenant, no secret, delegated permissions only).
Menu names are from the Microsoft Entra admin center / Azure portal (English UI).

## 1. Register the app

**App registrations → + New registration**
- Name: `msteams-mcp` (any name; users see it on the consent screen)
- Supported account types: **Accounts in this organizational directory only (Single tenant)**
- Redirect URI: leave empty → **Register**

From **Overview** note: **Application (client) ID** → `CLIENT_ID`, **Directory (tenant) ID** → `TENANT_ID`.
Neither is a secret.

## 2. Allow the device code flow

**Authentication** (new UI: **Settings** tab) → **Allow public client flows = Yes** → Save.

The app has **no client secret and no certificate** — do not create any. Public client flows only let the app
start a user sign-in; it cannot obtain data on its own.

## 3. Permissions (delegated only)

**API permissions → + Add a permission → Microsoft Graph → Delegated permissions**

| Permission | Needed by | Admin consent required |
|---|---|---|
| `User.Read` | sign-in, `get_current_user` (present by default) | No |
| `Chat.Read` | `list_chats`, `get_chat_messages` | No |

- **Do not add Application permissions.**
- You do not need **Grant admin consent** for these two; each user consents for themselves.
  If your tenant disables user consent, an admin grants consent for exactly these permissions.
- Adding a tool later = adding its delegated scope here (see `docs/ROADMAP.md`).

## 4. Restrict who can use it (important)

**Enterprise applications → (your app) → Properties**
- **Assignment required? = Yes** → Save
- **Users and groups → + Add user/group** → only the intended users → Assign

Unassigned users are refused at sign-in (`AADSTS50105`).

## 5. Sign-in (each user)

`npm run login` → open the shown URL → enter the code → sign in.
On the consent screen check the app name, and **do not tick "Consent on behalf of your organization"**
(visible to admins) — that would grant consent for every user.

## 6. Verify

- **Enterprise applications → app → Permissions**: **User consent** lists only the intended users with
  `User.Read Chat.Read`; **Admin consent** is empty.
- **Enterprise applications → app → Sign-in logs**: who signed in and when.

## Disable / remove

- Temporarily: **Properties → Enabled for users to sign-in? = No**
- Revoke a user's tokens: **Users → user → Revoke sessions**
- Permanently: delete the app registration (removes consents).
