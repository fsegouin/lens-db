"use client";

import { trackEvent, type EventName } from "@/lib/analytics";

type Props = {
  href: string;
  event: EventName;
  eventProps: Record<string, string | number | boolean | null>;
  className?: string;
  children: React.ReactNode;
};

export default function EbayTrackedLink({ href, event, eventProps, className, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackEvent(event, eventProps)}
    >
      {children}
    </a>
  );
}
