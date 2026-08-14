export function getUserFromCookie(cookieHeader: string | null): any {
  if (!cookieHeader) return null;
  try {
    const match = cookieHeader.match(/__bolt_session=([^;]+)/);
    if (!match) return null;
    const decoded = JSON.parse(atob(decodeURIComponent(match[1])));
    return decoded?.token ? JSON.parse(atob(decoded.token.split('.')[1])) : null;
  } catch {
    return null;
  }
}