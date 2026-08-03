export interface UserProfile {
  nickname: string;
  focus_areas: string;
  current_goals: string;
  communication_style: string;
  notes: string;
  gender: string;
  calendar_type: string;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_hour: number | null;
  birth_minute: number;
  birth_place: string | null;
  use_true_solar_time: boolean;
  bazi_note: string | null;
  birth_info: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatHistoryItem[];
}

export interface ChatResponse {
  type: string;
  message: string;
  answer: string;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
}

export interface BirthInfo {
  name: string;
  gender?: string;
  calendar_type?: string;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  birth_hour: number;
  birth_minute?: number;
  birth_place?: string;
  use_true_solar_time?: boolean;
  note?: string;
}

export interface BaziChart {
  type: string;
  chart: Record<string, unknown>;
}

export interface BaziAnalyzeRequest extends BirthInfo {
  focus?: string;
}

export interface BaziAnalyzeResponse {
  type: string;
  focus: string;
  period: string;
  answer: string;
}

export interface BaziQuestion {
  birth_info: BirthInfo;
  question: string;
  focus?: string;
}

export interface BaziQuestionResponse {
  type: string;
  chart: Record<string, unknown>;
  question: string;
  answer: string;
}

export interface TarotRequest {
  question: string;
  spread?: string;
}

export interface TarotResponse {
  type: string;
  question: string;
  cards: Record<string, unknown>[];
  answer: string;
}

export interface YijingRequest {
  question: string;
}

export interface YijingResponse {
  type: string;
  question: string;
  gua: Record<string, unknown>;
  answer: string;
}

export interface DailyFortuneResponse {
  type: string;
  seed: Record<string, unknown>;
  answer: string;
}

export interface TodoItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  notes: string;
  done: boolean;
  created_at?: string;
  completed_at?: string | null;
  updated_at: string;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  category: 'study' | 'project' | 'life' | 'deadline' | 'other';
  notes: string;
  done: boolean;
  created_at?: string;
  completed_at?: string | null;
  updated_at: string;
}

export interface ReflectionItem {
  id: string;
  date: string;
  win: string;
  challenge: string;
  tomorrow: string;
  mood: 'bright' | 'steady' | 'tired' | 'heavy';
  created_at: string;
}

export interface CompanionMemory {
  id: string;
  content: string;
  category: 'preference' | 'goal' | 'context' | 'boundary';
  created_at: string;
}

export interface FocusSession {
  id: string;
  task_title: string;
  planned_minutes: number;
  completed_minutes: number;
  completed: boolean;
  started_at: string;
}

export interface WeeklySummary {
  start: string;
  end: string;
  completed: number;
  focus_minutes: number;
  reflection_days: number;
  days: { date: string; completed: number; focus_minutes: number }[];
}

export interface Habit { id: string; name: string; frequency: 'daily' | 'weekly'; weekly_target: number; checkins: string[]; current_streak: number; longest_streak: number; streak_unit: 'day' | 'week'; checked_today: boolean; weekly_progress?: number; }
export interface Milestone { id: string; title: string; weight: number; done: boolean; }
export interface Goal { id: string; title: string; deadline: string; milestones: Milestone[]; progress: number; days_left: number | null; }
export interface Idea { id: string; content: string; category: string; tags: string[]; created_at: string; }
export interface GrowthDashboard { period: 'week' | 'month'; focus_minutes: number; moods: { date: string; score: number; note: string }[]; mood_average: number | null; expense_total: number; expense_by_category: Record<string, number>; habits: Habit[]; goals: Goal[]; todo_completion_rate: number; }

export type InboxKind = 'todo' | 'schedule' | 'expense' | 'habit' | 'goal' | 'idea' | 'project' | 'treehole';
export interface InboxProposal { kind: InboxKind; title: string; description: string; confidence: number; rationale: string; payload: Record<string, unknown>; missing_fields: string[]; source_text: string; }
export interface InboxAction { id: string; kind: InboxKind; target_id: string; payload: { proposal?: InboxProposal }; undone: boolean; created_at: string; }

export interface ProjectMilestone { id: string; title: string; weight: number; done: boolean; completed_at?: string | null; }
export interface ProjectRisk { id: string; text: string; level: 'low' | 'medium' | 'high'; status: 'open' | 'resolved'; created_at: string; }
export interface ProjectDecision { id: string; decision: string; rationale: string; review_date: string | null; created_at: string; }
export interface ProjectLink { id: string; title: string; url: string; kind: 'document' | 'reference' | 'repository' | 'other'; created_at: string; }
export interface Project { id: string; title: string; description: string; deadline: string | null; color: string; status: 'active' | 'paused' | 'completed' | 'archived'; milestones: ProjectMilestone[]; task_ids: string[]; event_ids: string[]; idea_ids: string[]; risks: ProjectRisk[]; decisions: ProjectDecision[]; links: ProjectLink[]; tasks: TodoItem[]; events: ScheduleEvent[]; ideas: Idea[]; progress: number; days_left: number | null; open_risks: number; weekly_completed: number; created_at: string; updated_at: string; }

export interface WeeklyPlanSuggestion { title: string; priority: 'low' | 'medium' | 'high'; due_date: string | null; project_id: string | null; selected: boolean; }
export interface WeeklyReviewData { start: string; end: string; metrics: { completed: number; focus_minutes: number; mood_average: number | null; expense_total: number; reflection_days: number; active_tasks: number; overdue: number }; wins: string[]; watchouts: string[]; habits: Habit[]; projects: Project[]; goals: Goal[]; old_idea: Idea | null; plan_suggestions: WeeklyPlanSuggestion[]; }
export interface SavedWeeklyReview { id: string; week_start: string; highlight: string; challenge: string; next_focus: string; note: string; snapshot: Record<string, unknown>; created_at: string; updated_at: string; }
export type PageId = 'home' | 'edge-ai' | 'chat' | 'inbox' | 'projects' | 'review' | 'todo' | 'schedule' | 'growth' | 'creative' | 'treehole' | 'tools' | 'settings';
