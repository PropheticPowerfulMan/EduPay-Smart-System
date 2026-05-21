type LocationSnapshot = Pick<Location, "origin" | "pathname" | "search" | "hash">;

function normalizeBasePath(basePath: string) {
  const trimmed = basePath.trim();
  if (!trimmed) return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function hasReceiptVerificationParams(search: string) {
  const params = new URLSearchParams(search);
  return params.has("tx") || params.has("c") || params.has("d");
}

function normalizeReceiptHash(hash: string) {
  if (!hash) return "";
  if (/^#\/receipt\/verify(?:[?\/]|$)/i.test(hash)) return hash;
  if (/^#receipt\/verify(?:[?\/]|$)/i.test(hash)) return `#/${hash.slice(1)}`;
  return "";
}

function isLegacyReceiptPath(pathname: string, basePath: string) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const normalizedBase = basePath.replace(/\/+$/, "") || "/";
  return normalizedPath === `${normalizedBase}/receipt/verify`;
}

export function resolveLegacyReceiptVerificationUrl(
  locationLike: LocationSnapshot,
  appBaseUrl: string = import.meta.env.BASE_URL
) {
  const basePath = normalizeBasePath(appBaseUrl);
  const normalizedHash = normalizeReceiptHash(locationLike.hash);
  const isBasePath = locationLike.pathname === basePath || locationLike.pathname === basePath.slice(0, -1);

  if (isLegacyReceiptPath(locationLike.pathname, basePath) && normalizedHash) {
    return `${locationLike.origin}${basePath}${normalizedHash}`;
  }

  if (isLegacyReceiptPath(locationLike.pathname, basePath)) {
    return `${locationLike.origin}${basePath}#/receipt/verify${locationLike.search}`;
  }

  if (normalizedHash && normalizedHash !== locationLike.hash) {
    return `${locationLike.origin}${locationLike.pathname}${locationLike.search}${normalizedHash}`;
  }

  if (isBasePath && !normalizedHash && hasReceiptVerificationParams(locationLike.search)) {
    return `${locationLike.origin}${basePath}#/receipt/verify${locationLike.search}`;
  }

  return null;
}

export function applyLegacyReceiptVerificationRedirect(locationLike: Location = window.location) {
  const redirectedUrl = resolveLegacyReceiptVerificationUrl(locationLike);
  if (redirectedUrl && redirectedUrl !== locationLike.href) {
    window.location.replace(redirectedUrl);
    return true;
  }
  return false;
}