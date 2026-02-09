const bcrypt: any = require('bcrypt');

export function userHasServiceAccess(
  username: string,
  serviceName: string,
  secrets: any,
  users: any,
): boolean {
  if (username === secrets.admin_email_address) return true;

  if (serviceName !== 'api') {
    const user = users.users?.find((u: any) => u.username === username);
    if (!user) return false;
    if (user.services?.includes('*')) return true;
    return user.services?.includes(serviceName) || false;
  } else {
    return false;
  }
}

export async function validateUserCredentials(
  username: string,
  password: string,
  serviceName: string,
  secrets: any,
  users: any,
) {
  if (username === secrets.admin_email_address && secrets.api_password_hash) {
    const valid = await bcrypt.compare(password, secrets.api_password_hash);
    if (valid) return { valid: true, username };
  }

  const user = users.users?.find((u: any) => u.username === username);
  if (user && user.password_hash) {
    const valid = await bcrypt.compare(password, user.password_hash);
    if (valid && userHasServiceAccess(username, serviceName, secrets, users)) {
      return { valid: true, username };
    }
    if (valid) {
      return { valid: false, error: 'Access denied to this service' };
    }
  }

  return { valid: false, error: 'Invalid credentials' };
}
