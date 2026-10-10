/**
 * One call that turns a project into everything a surface needs. The preview,
 * the code view, the accessibility check and every export adapter all go
 * through here, so they cannot disagree about what the design is.
 */

import { resolveComponents, type ResolvedComponent } from "./components";
import type { ComponentKind, DesignProject } from "./model";
import { resolveThemes, type ResolvedTheme } from "./themes";
import { resolveTokens, type TokenSource, type Tokens } from "./tokens";

export interface ResolvedProject {
  project: DesignProject;
  tokens: Tokens;
  tokenSource: Record<string, TokenSource>;
  themes: ResolvedTheme[];
  components: Record<ComponentKind, ResolvedComponent>;
}

export function resolveProject(project: DesignProject): ResolvedProject {
  const { tokens, source } = resolveTokens(project);
  return {
    project,
    tokens,
    tokenSource: source,
    themes: resolveThemes(project, tokens),
    components: resolveComponents(project, tokens),
  };
}
