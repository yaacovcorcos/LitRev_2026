import type { AnchorHTMLAttributes, ReactNode } from "react";

type MockLinkProps = {
  href: string;
  prefetch?: boolean;
  children: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

export const nextLinkPrefetchMock = {
  default: ({ href, prefetch, children, ...props }: MockLinkProps) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
};
