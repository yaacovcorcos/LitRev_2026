import { NavLink } from "@/types/nav";

export const mainNavLinks: NavLink[] = [
  { label: "Home", icon: "home", href: "/", navKey: "projects" },
  { label: "AI Assistant", icon: "smart_toy", href: "/ai", navKey: "ai" },
  { label: "Library", icon: "bookmarks", href: "/library", navKey: "library" },
];

export const adminMainNavLink: NavLink = {
  label: "Admin",
  icon: "admin_panel_settings",
  href: "/admin",
  navKey: "admin",
};

export const bottomNavLinks: NavLink[] = [
  { label: "Notifications", icon: "notifications", href: "#notifications", navKey: "notifications" },
  { label: "Profile", icon: "person", href: "#profile", navKey: "profile" },
  { label: "Help", icon: "help_outline", href: "#help", navKey: "help" },
];

export const mobileNavLinks: NavLink[] = [
  { label: "Home", icon: "home", href: "/", navKey: "projects" },
  { label: "AI", icon: "smart_toy", href: "/ai", navKey: "ai" },
  { label: "New", icon: "add_circle", href: "#", navKey: "new" },
  { label: "Library", icon: "bookmarks", href: "/library", navKey: "library" },
];

export const adminMobileNavLink: NavLink = {
  label: "Admin",
  icon: "admin_panel_settings",
  href: "/admin",
  navKey: "admin",
};
