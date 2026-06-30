import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTenantSlug() {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }
  
  if (hostname.endsWith(".localhost")) {
    return hostname.substring(0, hostname.length - 10); // length of ".localhost" is 10
  }
  
  const rootDomain = "nexusone.ai";
  if (hostname.endsWith("." + rootDomain)) {
    return hostname.substring(0, hostname.length - (rootDomain.length + 1));
  }
  
  if (parts.length > 2) {
    return parts[0];
  }
  
  return null;
}

export function getRedirectUrlForOrg(org: { slug: string } | null, route: string) {
  if (!org || typeof window === "undefined") return route;
  
  const currentHost = window.location.host;
  const currentTenant = getTenantSlug();
  
  if (currentTenant === org.slug) {
    return route;
  }
  
  const protocol = window.location.protocol;
  let newHost = currentHost;
  if (currentTenant) {
    newHost = currentHost.replace(`${currentTenant}.`, `${org.slug}.`);
  } else {
    newHost = `${org.slug}.${currentHost}`;
  }
  
  return `${protocol}//${newHost}${route}`;
}
