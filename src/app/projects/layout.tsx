"use client";

import { ReactNode } from "react";
import { ProjectLayout } from "@/components/layout/project-layout";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <ProjectLayout>{children}</ProjectLayout>;
}
