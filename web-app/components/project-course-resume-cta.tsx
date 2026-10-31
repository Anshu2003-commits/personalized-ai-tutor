"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ResumeTarget = {
  moduleSlug: string;
  moduleLabel: string;
  href: string;
};

type ProjectCourseResumeCtaProps = {
  courseSlug: string;
  defaultHref: string;
  defaultLabel: string;
  targets: ResumeTarget[];
};

function storageKey(courseSlug: string) {
  return `onlearn:project-course:${courseSlug}:last-opened-module`;
}

function storageEventName(courseSlug: string) {
  return `onlearn-project-course-${courseSlug}-last-opened-module`;
}

function subscribeToLastOpenedModule(courseSlug: string, onChange: () => void) {
  const eventName = storageEventName(courseSlug);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey(courseSlug)) {
      onChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(eventName, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(eventName, onChange);
  };
}

function getLastOpenedModule(courseSlug: string) {
  return window.localStorage.getItem(storageKey(courseSlug));
}

export function ProjectCourseResumeCta({
  courseSlug,
  defaultHref,
  defaultLabel,
  targets,
}: ProjectCourseResumeCtaProps) {
  const moduleSlug = useSyncExternalStore(
    (onChange) => subscribeToLastOpenedModule(courseSlug, onChange),
    () => getLastOpenedModule(courseSlug),
    () => null,
  );

  const target = useMemo(
    () => targets.find((item) => item.moduleSlug === moduleSlug),
    [moduleSlug, targets],
  );

  return (
    <Link
      href={target?.href ?? defaultHref}
      className={cn(
        buttonVariants(),
        "w-fit max-w-full shrink-0 gap-2 whitespace-nowrap",
      )}
    >
      {target ? `Continue ${target.moduleLabel}` : defaultLabel}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function ProjectVisitRecorder({
  courseSlug,
  moduleSlug,
}: {
  courseSlug: string;
  moduleSlug: string;
}) {
  useEffect(() => {
    window.localStorage.setItem(storageKey(courseSlug), moduleSlug);
    window.dispatchEvent(new Event(storageEventName(courseSlug)));
  }, [courseSlug, moduleSlug]);

  return null;
}
