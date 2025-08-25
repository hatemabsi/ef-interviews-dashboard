export type UUID = string;

export interface StartupContext {
  userId: UUID | null;
  email: string | null;
  startupId: UUID | null;
}

export interface IdeaLite {
  id: number;
  name: string;
  slug: string;
  status: string;
  cofounder?: string | null;
}
